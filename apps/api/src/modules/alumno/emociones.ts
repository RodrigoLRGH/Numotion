// Detección emocional del lado alumno (EXP-05: RF-01, RF-27 del alumno, RNF-03, RC-04).
// Por fotograma se guarda solo emoción + confianza + estado derivado (nunca la imagen). En cada
// fotograma y cada intento se recalcula el Índice de Frustración; con 2 evaluaciones seguidas sobre
// el umbral se le pregunta al alumno si quiere ayuda (con enfriamiento por asignación). Sin alertas
// al docente: RF-16 queda fuera del MVP (migración 0015).
// Al alumno nunca se le devuelve la emoción detectada (RF-65).
import { derivarEstado, erroresConsecutivos, evaluarAlerta, fraccionFrustracion } from "@numotion/core/dominio/alertas";
import { estadoVentana, indiceFrustracion } from "@numotion/core/dominio/adaptativo";
import { conContexto, type Contexto, type Tx } from "../../infra/db";
import { detectarYDescartar, emotionGateway, metricas } from "../../infra/emociones";

async function config<T>(tx: Tx, clave: string, porDefecto: T): Promise<T> {
    const c = await tx.config_adaptativa.findUnique({ where: { clave }, select: { valor: true } });
    return (c?.valor as T | undefined) ?? porDefecto;
}

const entero = (v: string | undefined, porDefecto: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : porDefecto);

export interface OfertaAyuda {
    mensaje: string;
}

/** Pregunta al alumno (RF-27): si acepta, el cliente abre la guía paso a paso del ejercicio. */
const MENSAJE_AYUDA = { desinteres: "¿Te ayudo a seguir? ¡Tú puedes!", otro: "¿Quieres que te ayude? Vamos paso a paso." } as const;

export interface Evaluacion {
    indice: number;
    ofrecerAyuda: OfertaAyuda | null;
}

/**
 * Recalcula el IF de la asignación en curso y, si toca, le ofrece ayuda al alumno (EXP-05.4).
 * `inactividadSeg` lo informa el cliente con cada fotograma; en un intento es 0.
 */
export async function evaluarFrustracion(tx: Tx, alumnoId: string, asignacionId: string, inactividadSeg: number, conCamara: boolean): Promise<Evaluacion | null> {
    const [a] = await tx.$queryRaw<{ id: string; estado: string; if_consecutivos: number; ayuda_actual: boolean; ultima_oferta_ayuda: Date | null }[]>`
        SELECT s.id, s.estado::text, s.if_consecutivos::int, s.ayuda_actual, s.ultima_oferta_ayuda
          FROM asignacion_alumno s WHERE s.id = ${asignacionId}::uuid AND s.alumno_id = ${alumnoId}::uuid FOR UPDATE`;
    if (!a || a.estado === "completada") return null;

    const ventana = await config(tx, "ventana_seg", 60);
    const umbral = await config(tx, "umbral_alerta", 0.6);
    const cooldown = await config(tx, "cooldown_alerta_min", 5);
    const muestras = await tx.$queryRaw<{ estado_derivado: string; emocion: string }[]>`SELECT * FROM fn_estados_recientes(${ventana}::int)`;
    const intentos = await tx.intento_ejercicio.findMany({ where: { asignacion_id: a.id }, orderBy: [{ creado_en: "desc" }, { numero_intento: "desc" }], take: 10, select: { correcta: true } });
    const errores = erroresConsecutivos(intentos);
    const fraccion = conCamara ? fraccionFrustracion(muestras.map((m) => m.estado_derivado)) : null;
    const estado = estadoVentana(muestras.map((m) => ({ estado: m.estado_derivado, emocion: m.emocion })), inactividadSeg, await config(tx, "inactividad_seg", 45));
    const indice = indiceFrustracion({ fraccionFrustracion: fraccion, erroresConsecutivos: errores, inactividadSeg, ayudasEnEjercicio: a.ayuda_actual ? 1 : 0 });

    const ahora = new Date();
    const decision = evaluarAlerta({ indice, umbral, consecutivosPrevios: a.if_consecutivos, ultimaAlertaMs: a.ultima_oferta_ayuda?.getTime() ?? null, ahoraMs: ahora.getTime(), cooldownMin: cooldown });
    await tx.asignacion_alumno.update({
        where: { id: a.id },
        data: { if_consecutivos: decision.consecutivos, ultimo_if: indice, ...(decision.crear ? { ultima_oferta_ayuda: ahora } : {}) },
        select: { id: true },
    });
    if (!decision.crear) return { indice, ofrecerAyuda: null };
    return { indice, ofrecerAyuda: { mensaje: estado === "desinteres" ? MENSAJE_AYUDA.desinteres : MENSAJE_AYUDA.otro } };
}

export type ResultadoFrame =
    | { procesado: true; ofrecerAyuda: OfertaAyuda | null }
    | { procesado: false; motivo: "frecuencia" | "tope" | "desactivado" | "sin_lectura" | "sin_sesion" };

/**
 * Un fotograma de la cámara durante una actividad (EXP-05.1/05.2). La llamada a Rekognition se hace
 * fuera de la transacción para no retener la conexión; el buffer se descarta siempre.
 */
export async function procesarFrame(ctx: NonNullable<Contexto>, imagen: Uint8Array, asignacionId: string | null, inactividadSeg: number): Promise<ResultadoFrame> {
    const g = emotionGateway();
    if (!g) {
        imagen.fill(0);
        return { procesado: false, motivo: "desactivado" };
    }
    const reserva = await conContexto(ctx, async (tx) => {
        const intervalo = entero(process.env.REKOGNITION_MIN_INTERVAL_SECONDS, await config(tx, "rekognition_intervalo_seg", 5));
        const tope = entero(process.env.REKOGNITION_DAILY_CAP_PER_ALUMNO, await config(tx, "rekognition_tope_diario", 400));
        const [{ r }] = await tx.$queryRaw<{ r: string }[]>`SELECT fn_rekognition_reservar(${intervalo}::int, ${tope}::int) AS r`;
        return r as "ok" | "frecuencia" | "tope";
    });
    if (reserva !== "ok") {
        imagen.fill(0);
        return { procesado: false, motivo: reserva };
    }
    metricas.sumar();
    const lectura = await detectarYDescartar(g, imagen);
    if (!lectura) return { procesado: false, motivo: "sin_lectura" };

    return conContexto(ctx, async (tx) => {
        const sesion = await tx.sesion_alumno.findFirst({ where: { alumno_id: ctx.id }, orderBy: { fecha: "desc" }, select: { id: true } });
        if (!sesion) return { procesado: false as const, motivo: "sin_sesion" as const };
        const asignacion = asignacionId ? await tx.asignacion_alumno.findFirst({ where: { id: asignacionId, alumno_id: ctx.id }, select: { id: true } }) : null;
        const confMin = await config(tx, "conf_min", 60);
        // Sin RETURNING: el alumno puede insertar sus eventos pero nunca leerlos (RLS, RF-65)
        const estado = derivarEstado(lectura.emocion, lectura.confianza, confMin);
        await tx.$executeRaw`
            INSERT INTO evento_emocional (alumno_id, sesion_id, asignacion_id, emocion, confianza, estado_derivado)
            VALUES (${ctx.id}::uuid, ${sesion.id}::uuid, ${asignacion?.id ?? null}::uuid, ${lectura.emocion}::emocion_rekognition,
                    ${Math.max(0, Math.min(100, lectura.confianza))}, ${estado}::estado_emocional)`;
        const evaluacion = asignacion ? await evaluarFrustracion(tx, ctx.id, asignacion.id, inactividadSeg, true) : null;
        return { procesado: true as const, ofrecerAyuda: evaluacion?.ofrecerAyuda ?? null };
    });
}

