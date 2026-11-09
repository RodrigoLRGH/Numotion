// Detección emocional y alerta temprana del lado alumno (EXP-05: RF-01, RF-16, RF-27, RNF-03, RC-04).
// Por fotograma se guarda solo emoción + confianza + estado derivado (nunca la imagen). En cada
// fotograma y cada intento se recalcula el Índice de Frustración; con 2 evaluaciones seguidas sobre
// el umbral se crea una alerta para el docente y al alumno se le pregunta si quiere ayuda.
// Al alumno nunca se le devuelve la emoción detectada (RF-65).
import { derivarEstado, describirSenales, erroresConsecutivos, evaluarAlerta, fraccionFrustracion } from "@numotion/core/dominio/alertas";
import { estadoVentana, indiceFrustracion } from "@numotion/core/dominio/adaptativo";
import { conContexto, type Contexto, type Tx } from "../../infra/db";
import { detectarYDescartar, emotionGateway, metricas } from "../../infra/emociones";

async function config<T>(tx: Tx, clave: string, porDefecto: T): Promise<T> {
    const c = await tx.config_adaptativa.findUnique({ where: { clave }, select: { valor: true } });
    return (c?.valor as T | undefined) ?? porDefecto;
}

const entero = (v: string | undefined, porDefecto: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : porDefecto);

export interface OfertaAyuda {
    alertaId: string;
    mensaje: string;
}

export interface Evaluacion {
    indice: number;
    ofrecerAyuda: OfertaAyuda | null;
}

/**
 * Recalcula el IF de la asignación en curso y, si toca, crea la alerta (EXP-05.4, EXP-05.5).
 * `inactividadSeg` lo informa el cliente con cada fotograma; en un intento es 0.
 */
export async function evaluarFrustracion(tx: Tx, alumnoId: string, asignacionId: string, inactividadSeg: number, conCamara: boolean): Promise<Evaluacion | null> {
    const [a] = await tx.$queryRaw<{ id: string; estado: string; if_consecutivos: number; ejercicio_actual_id: string | null; ayuda_actual: boolean }[]>`
        SELECT s.id, s.estado::text, s.if_consecutivos::int, s.ejercicio_actual_id, s.ayuda_actual
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

    const ultima = await tx.alerta.findFirst({ where: { alumno_id: alumnoId, asignacion_id: a.id }, orderBy: { creado_en: "desc" }, select: { creado_en: true } });
    const decision = evaluarAlerta({ indice, umbral, consecutivosPrevios: a.if_consecutivos, ultimaAlertaMs: ultima?.creado_en.getTime() ?? null, ahoraMs: Date.now(), cooldownMin: cooldown });
    await tx.asignacion_alumno.update({ where: { id: a.id }, data: { if_consecutivos: decision.consecutivos, ultimo_if: indice }, select: { id: true } });
    if (!decision.crear) return { indice, ofrecerAyuda: null };

    const tipoGuia = estado === "desinteres" ? "desinteres" : "frustracion";
    const guia = await tx.guia_actuacion.findFirst({ where: { estado: tipoGuia }, select: { id: true, mensaje_alumno: true } });
    const senales = { estado: fraccion === null ? null : estado, erroresConsecutivos: errores, inactividadSeg: Math.round(inactividadSeg), ayudas: a.ayuda_actual ? 1 : 0, sinCamara: fraccion === null };
    const [alerta] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO alerta (alumno_id, docente_id, asignacion_id, indice, senales, guia_id)
        VALUES (${alumnoId}::uuid, docente_del_alumno(), ${a.id}::uuid, ${indice}, ${JSON.stringify({ ...senales, descripcion: describirSenales(senales) })}::jsonb, ${guia?.id ?? null}::uuid)
        RETURNING id`;
    return { indice, ofrecerAyuda: { alertaId: alerta.id, mensaje: guia?.mensaje_alumno ?? "¿Quieres que te ayude?" } };
}

export type ResultadoFrame =
    | { procesado: true; ofrecerAyuda: OfertaAyuda | null }
    | { procesado: false; motivo: "sin_consentimiento" | "frecuencia" | "tope" | "desactivado" | "sin_lectura" | "sin_sesion" };

/**
 * Un fotograma de la cámara durante una actividad (EXP-05.1/05.2). La llamada a Rekognition se hace
 * fuera de la transacción para no retener la conexión; el buffer se descarta siempre.
 */
export async function procesarFrame(ctx: NonNullable<Contexto>, aceptaCamara: boolean, imagen: Uint8Array, asignacionId: string | null, inactividadSeg: number): Promise<ResultadoFrame> {
    const g = emotionGateway();
    if (!aceptaCamara || !g) {
        imagen.fill(0);
        return { procesado: false, motivo: !aceptaCamara ? "sin_consentimiento" : "desactivado" };
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

/** RF-27 lado alumno: si acepta, el motor aplica R2 (−1 nivel) al cerrar el ejercicio. */
export async function responderAlerta(tx: Tx, alumnoId: string, alertaId: string, acepta: boolean): Promise<boolean> {
    const { count } = await tx.alerta.updateMany({ where: { id: alertaId, alumno_id: alumnoId, alumno_acepto_ayuda: null }, data: { alumno_acepto_ayuda: acepta } });
    if (count) return true;
    return (await tx.alerta.count({ where: { id: alertaId, alumno_id: alumnoId } })) > 0;
}
