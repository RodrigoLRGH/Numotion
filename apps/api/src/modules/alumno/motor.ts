// Motor de ejercicios de las actividades asignadas (EXP-04: RF-01, RF-03, RF-11, RF-21, RF-45, RF-47, RF-60).
// Todo en contexto del alumno (RLS). El avance de la asignación lo hace el trigger de BD; aquí se
// deciden puntos, guía y nivel, y se registra cada ajuste en ajuste_dificultad (ADR-005).
import { decidirNivel, estadoVentana, indiceFrustracion, type MotivoAjuste } from "@numotion/core/dominio/adaptativo";
import { semillaDeTexto, crearRng } from "@numotion/core/dominio/aleatorio";
import type { TipoInteraccionActividad } from "@numotion/core/dominio/catalogo";
import { clasificarError, esCorrecta, generarParaActividad, respuestaLegible } from "@numotion/core/dominio/contenido";
import { interesPara, pedidoDeHistoria, type PedidoHistoria } from "@numotion/core/dominio/historias";
import type { Ejercicio } from "@numotion/core/dominio/ejercicios";
import { estrellas, puntosPorEjercicio } from "@numotion/core/dominio/puntos";
import { errorBd, num, Prisma, type Tx } from "../../infra/db";
import { aEjercicio, aPublico, cargarEjercicio, insertarEjercicio, json, MAX_INTENTOS, type EjercicioPublico, type FilaEjercicio } from "./ejercicio";
import { evaluarFrustracion, type OfertaAyuda } from "./emociones";
import { otorgarInsignias, sumarPuntos, type InsigniaObtenida } from "./gamificacion";

export { MAX_INTENTOS };

async function config<T>(tx: Tx, clave: string, porDefecto: T): Promise<T> {
    const c = await tx.config_adaptativa.findUnique({ where: { clave }, select: { valor: true } });
    return (c?.valor as T | undefined) ?? porDefecto;
}

// ───────────── Mis actividades (RF-64, EXP-04.1) ─────────────

export interface ActividadAlumno {
    asignacionId: string;
    nombre: string;
    tema: string;
    temaClave: string;
    tipoInteraccion: string;
    fechaAsignacion: string;
    estado: "pendiente" | "en_curso" | "completada";
    progreso: { resueltos: number; total: number };
    resultadoFinal: number | null;
}

/** Asignaciones del alumno con fecha de hoy o anterior (A-28): en curso, pendientes y completadas. */
export async function misActividades(tx: Tx, alumnoId: string): Promise<ActividadAlumno[]> {
    const filas = await tx.$queryRaw<(Omit<ActividadAlumno, "resultadoFinal"> & { resultadoFinal: Prisma.Decimal | null })[]>`
        SELECT s.id AS "asignacionId", ac.nombre, t.nombre AS tema, t.clave AS "temaClave", ac.tipo_interaccion AS "tipoInteraccion",
               to_char(ac.fecha_asignacion, 'YYYY-MM-DD') AS "fechaAsignacion", s.estado,
               json_build_object('resueltos', s.ejercicios_resueltos, 'total', ac.num_ejercicios) AS progreso,
               s.resultado_final AS "resultadoFinal"
          FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id JOIN tema t ON t.id = ac.tema_id
         WHERE s.alumno_id = ${alumnoId}::uuid AND ac.fecha_asignacion <= fn_hoy_local()
         ORDER BY CASE s.estado WHEN 'en_curso' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END, ac.fecha_asignacion DESC, ac.nombre`;
    return filas.map((f) => ({ ...f, resultadoFinal: num(f.resultadoFinal) }));
}

// Representación del ejercicio: ./ejercicio (compartida con la práctica libre)
export { hashRespuesta, type EjercicioPublico } from "./ejercicio";

// ───────────── Asignación ─────────────

interface Asignacion {
    id: string;
    estado: "pendiente" | "en_curso" | "completada";
    nivel_inicial: number;
    nivel_actual: number;
    ejercicios_resueltos: number;
    puntaje: number;
    resultado_final: Prisma.Decimal | null;
    ejercicio_actual_id: string | null;
    ayuda_actual: boolean;
    tema_id: string;
    tema_clave: string;
    tipo_interaccion: TipoInteraccionActividad;
    num_ejercicios: number;
    nombre: string;
}

async function cargarAsignacion(tx: Tx, alumnoId: string, id: string, bloquear = false): Promise<Asignacion | null> {
    // Asignación + actividad + tema, con bloqueo de fila para serializar intentos simultáneos: SQL
    const filas = await tx.$queryRaw<Asignacion[]>`
        SELECT s.id, s.estado, s.nivel_inicial, s.nivel_actual, s.ejercicios_resueltos, s.puntaje, s.resultado_final,
               s.ejercicio_actual_id, s.ayuda_actual, ac.tema_id, t.clave AS tema_clave, ac.tipo_interaccion, ac.num_ejercicios, ac.nombre
          FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id JOIN tema t ON t.id = ac.tema_id
         WHERE s.id = ${id}::uuid AND s.alumno_id = ${alumnoId}::uuid AND ac.fecha_asignacion <= fn_hoy_local()
        ${bloquear ? Prisma.sql`FOR UPDATE OF s` : Prisma.empty}`;
    return filas[0] ?? null;
}

export interface Recompensa {
    puntos: number;
    estrellas: 1 | 2 | 3;
    resultadoFinal: number;
}

const recompensa = (a: Pick<Asignacion, "puntaje" | "resultado_final">): Recompensa => {
    const resultado = num(a.resultado_final) ?? 0;
    return { puntos: a.puntaje, estrellas: estrellas(resultado), resultadoFinal: resultado };
};

export type Siguiente =
    | {
          ejercicio: EjercicioPublico;
          nivel: number;
          intentosUsados: number;
          ayudaUsada: boolean;
          actividad: { nombre: string; tipoInteraccion: string };
          progreso: { resueltos: number; total: number };
      }
    | { completada: true; recompensa: Recompensa; actividad: { nombre: string } }
    | { error: "no_encontrada" | "sin_contenido" };

const contarPresentados = async (tx: Tx, asignacionId: string) =>
    (await tx.intento_ejercicio.findMany({ where: { asignacion_id: asignacionId }, distinct: ["ejercicio_id"], select: { ejercicio_id: true } })).length;

/** Ejercicio n.º `presentados` de la asignación al nivel dado: determinista para que plan y creación coincidan. */
const generarSiguiente = (a: Asignacion, presentados: number) =>
    generarParaActividad(a.tema_clave, a.tipo_interaccion, a.nivel_actual, crearRng(semillaDeTexto(`actividad|${a.id}|${presentados}|${a.nivel_actual}`)));

const crearEjercicio = (tx: Tx, a: Asignacion, e: Ejercicio, origen: "generador" | "openai", contexto?: string) =>
    insertarEjercicio(tx, { temaId: a.tema_id, tipo: a.tipo_interaccion, nivel: a.nivel_actual }, e, origen, contexto);

// ───────────── Historias con OpenAI (T-03-04-20, EXP-04.7) ─────────────

/** Cómo servir el próximo ejercicio nuevo con historia; vale solo si nivel y presentados no cambiaron. */
export type PlanHistoria = { nivel: number; presentados: number } & (
    | { reusarId: string }
    | { pedido: PedidoHistoria; ejercicio: Ejercicio }
);

/** Propuesta para siguienteEjercicio: una historia ya generada y validada, o una de la caché. */
export type Propuesta = { nivel: number; presentados: number } & ({ reusarId: string } | { ejercicio: Ejercicio; contexto: string });

/**
 * Fase 1 (transacción corta, sin bloqueo): si toca crear un ejercicio nuevo que se puede contar como
 * historia, devuelve la de la caché (mismo tema, tipo, nivel e interés, no vista en esta asignación)
 * o el pedido para OpenAI. null si hay un ejercicio vigente, la actividad terminó o no aplica.
 */
export async function planHistoria(tx: Tx, alumnoId: string, asignacionId: string): Promise<PlanHistoria | null> {
    const a = await cargarAsignacion(tx, alumnoId, asignacionId);
    if (!a || a.estado === "completada" || a.ejercicio_actual_id) return null;
    const presentados = await contarPresentados(tx, a.id);
    const e = generarSiguiente(a, presentados);
    if (!e) return null;
    const { intereses } = await tx.alumno.findUniqueOrThrow({ where: { id: alumnoId }, select: { intereses: true } });
    const pedido = pedidoDeHistoria(e, a.tipo_interaccion, interesPara(intereses, presentados));
    if (!pedido) return null;
    const [cache] = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id FROM ejercicio e
         WHERE e.origen = 'openai' AND e.activo AND e.tema_id = ${a.tema_id}::uuid
           AND e.tipo_interaccion = ${a.tipo_interaccion}::tipo_interaccion AND e.nivel = ${a.nivel_actual}
           AND e.respuesta->>'contexto' = ${pedido.interes}
           AND NOT EXISTS (SELECT 1 FROM intento_ejercicio i WHERE i.asignacion_id = ${a.id}::uuid AND i.ejercicio_id = e.id)
         ORDER BY e.creado_en LIMIT 1`;
    const base = { nivel: a.nivel_actual, presentados };
    return cache ? { ...base, reusarId: cache.id } : { ...base, pedido, ejercicio: e };
}

/** Ejercicio vigente (retoma el que quedó abierto) o uno nuevo del tema, tipo y nivel actual (RF-21). */
export async function siguienteEjercicio(tx: Tx, alumnoId: string, asignacionId: string, propuesta?: Propuesta | null): Promise<Siguiente> {
    const a = await cargarAsignacion(tx, alumnoId, asignacionId, true);
    if (!a) return { error: "no_encontrada" };
    if (a.estado === "completada") return { completada: true, recompensa: recompensa(a), actividad: { nombre: a.nombre } };

    let fila: FilaEjercicio;
    let intentosUsados = 0;
    if (a.ejercicio_actual_id) {
        fila = await cargarEjercicio(tx, a.ejercicio_actual_id);
        intentosUsados = await tx.intento_ejercicio.count({ where: { asignacion_id: a.id, ejercicio_id: a.ejercicio_actual_id } });
    } else {
        const presentados = await contarPresentados(tx, a.id);
        // La propuesta se preparó fuera de la transacción: solo vale si nada cambió desde el plan
        const vigente = propuesta && propuesta.nivel === a.nivel_actual && propuesta.presentados === presentados ? propuesta : null;
        if (vigente && "reusarId" in vigente) {
            fila = await cargarEjercicio(tx, vigente.reusarId);
        } else if (vigente) {
            fila = await crearEjercicio(tx, a, vigente.ejercicio, "openai", vigente.contexto);
        } else {
            const e = generarSiguiente(a, presentados);
            if (!e) return { error: "sin_contenido" };
            fila = await crearEjercicio(tx, a, e, "generador");
        }
        await tx.asignacion_alumno.update({ where: { id: a.id }, data: { ejercicio_actual_id: fila.id, ayuda_actual: false }, select: { id: true } });
        a.ayuda_actual = false;
    }
    return {
        ejercicio: aPublico(fila),
        nivel: a.nivel_actual,
        intentosUsados,
        ayudaUsada: a.ayuda_actual,
        actividad: { nombre: a.nombre, tipoInteraccion: a.tipo_interaccion },
        progreso: { resueltos: a.ejercicios_resueltos, total: a.num_ejercicios },
    };
}

/** Al empezar: si el diagnóstico del día cambió el nivel sugerido, se recalcula una vez (02-…§3.5). */
export async function iniciarActividad(tx: Tx, alumnoId: string, asignacionId: string, propuesta?: Propuesta | null): Promise<Siguiente> {
    if (!(await ajustarNivelInicial(tx, alumnoId, asignacionId))) return { error: "no_encontrada" };
    return siguienteEjercicio(tx, alumnoId, asignacionId, propuesta);
}

/** Recalcula el nivel con el diagnóstico del día si la actividad no ha empezado. false si no existe. */
export async function ajustarNivelInicial(tx: Tx, alumnoId: string, asignacionId: string): Promise<boolean> {
    const a = await cargarAsignacion(tx, alumnoId, asignacionId, true);
    if (!a) return false;
    if (a.estado === "pendiente" && !a.ejercicio_actual_id) {
        const [{ nivel }] = await tx.$queryRaw<{ nivel: number }[]>`SELECT fn_nivel_inicial(${alumnoId}::uuid, ${a.tema_id}::uuid)::int AS nivel`;
        if (nivel !== a.nivel_actual) {
            await tx.asignacion_alumno.update({ where: { id: a.id }, data: { nivel_actual: nivel }, select: { id: true } });
            await tx.ajuste_dificultad.create({
                data: { asignacion_id: a.id, alumno_id: alumnoId, nivel_anterior: a.nivel_actual, nivel_nuevo: nivel, motivo: "inicial", detalle: json({ regla: "diagnostico_del_dia" }) },
                select: { id: true },
            });
        }
    }
    return true;
}

// ───────────── Guía (RF-11, RF-45) ─────────────

export interface Guia {
    modo: "paso_a_paso" | "final";
    pasos: { orden: number; texto: string }[];
    respuestaCorrecta?: string;
}

/** Botón "Ayuda": abre la guía paso a paso del ejercicio vigente; el acierto posterior vale 3 puntos. */
export async function pedirGuia(tx: Tx, alumnoId: string, asignacionId: string, ejercicioId: string): Promise<Guia | null> {
    const a = await cargarAsignacion(tx, alumnoId, asignacionId, true);
    if (!a || a.estado === "completada" || a.ejercicio_actual_id !== ejercicioId) return null;
    await tx.asignacion_alumno.update({ where: { id: a.id }, data: { ayuda_actual: true }, select: { id: true } });
    const fila = await cargarEjercicio(tx, ejercicioId);
    return { modo: "paso_a_paso", pasos: fila.pasos_solucion };
}

// ───────────── Intentos (EXP-04.4, flujo registrarIntento) ─────────────

export interface DatosIntento {
    clienteId: string;
    asignacionId: string;
    ejercicioId: string;
    respuesta: string;
    tiempoMs: number;
    ayudaSolicitada: boolean;
}

export interface ResultadoIntento {
    correcta: boolean;
    puntos: number;
    ejercicioCerrado: boolean;
    intentosRestantes: number;
    nivel: { anterior: number; actual: number; motivo: MotivoAjuste | null };
    guia: Guia | null;
    asignacion: { estado: string; resueltos: number; total: number };
    recompensa: Recompensa | null;
    /** Insignias ganadas con este intento (animación en el cliente) */
    nuevasInsignias: InsigniaObtenida[];
    /** Nuevo nivel de gamificación si este intento lo subió */
    subioNivel: number | null;
    /** IF alto 2 veces seguidas: se pregunta al alumno si quiere ayuda (RF-27) */
    ofrecerAyuda: OfertaAyuda | null;
}

export type FalloIntento = { error: "no_encontrada" | "completada" | "ejercicio_no_vigente" | "cliente_repetido" };

async function senalesNivel(tx: Tx, a: Asignacion, ayudas: number) {
    const ultimos = await tx.$queryRaw<{ correcto: boolean; primero: boolean; tiempo: number; fin: Date }[]>`
        SELECT bool_or(correcta) AS correcto, bool_or(correcta AND numero_intento = 1) AS primero,
               sum(tiempo_ms)::int AS tiempo, max(creado_en) AS fin
          FROM intento_ejercicio WHERE asignacion_id = ${a.id}::uuid
         GROUP BY ejercicio_id HAVING bool_or(correcta) OR max(numero_intento) >= ${MAX_INTENTOS}
         ORDER BY max(creado_en) DESC`;
    const intentos = await tx.intento_ejercicio.findMany({
        where: { asignacion_id: a.id },
        orderBy: [{ creado_en: "desc" }, { numero_intento: "desc" }],
        take: 20,
        select: { correcta: true },
    });
    const errores = intentos.findIndex((i) => i.correcta);
    const ultimoCambio = await tx.ajuste_dificultad.aggregate({ where: { asignacion_id: a.id }, _max: { creado_en: true } });
    const desde: Date | null = ultimoCambio._max.creado_en;
    const ventana = await config(tx, "ventana_seg", 60);
    const muestras = await tx.$queryRaw<{ estado_derivado: string; emocion: string }[]>`SELECT * FROM fn_estados_recientes(${ventana}::int)`;
    const conDato = muestras.filter((m) => m.estado_derivado !== "sin_dato");
    const estado = estadoVentana(muestras.map((m) => ({ estado: m.estado_derivado, emocion: m.emocion })), 0);
    const erroresConsecutivos = errores === -1 ? intentos.length : errores;
    return {
        ultimos3: ultimos.slice(0, 3).map((u) => ({ correcto: u.correcto, correctoPrimerIntento: u.primero, tiempoMs: u.tiempo })),
        ejerciciosDesdeUltimoCambio: ultimos.filter((u) => !desde || u.fin > desde).length,
        erroresConsecutivos,
        estadoVentana: estado,
        indiceFrustracion: indiceFrustracion({
            fraccionFrustracion: conDato.length ? conDato.filter((m) => m.estado_derivado === "frustracion").length / conDato.length : null,
            erroresConsecutivos,
            inactividadSeg: 0,
            ayudasEnEjercicio: ayudas,
        }),
        tiempoReferenciaMs: await config(tx, "tiempo_referencia_ms", 30_000),
        umbralAlerta: await config(tx, "umbral_alerta", 0.6),
    };
}

export async function registrarIntento(tx: Tx, alumnoId: string, d: DatosIntento): Promise<ResultadoIntento | FalloIntento> {
    // Idempotencia: el mismo clienteId devuelve la misma respuesta
    const previo = await tx.intento_ejercicio.findUnique({ where: { cliente_id: d.clienteId }, select: { resultado: true } });
    if (previo?.resultado) return previo.resultado as unknown as ResultadoIntento;

    const a = await cargarAsignacion(tx, alumnoId, d.asignacionId, true);
    if (!a) return { error: "no_encontrada" };
    if (a.estado === "completada") return { error: "completada" };
    if (a.ejercicio_actual_id !== d.ejercicioId) return { error: "ejercicio_no_vigente" };

    const previos = await tx.intento_ejercicio.count({ where: { asignacion_id: a.id, ejercicio_id: d.ejercicioId } });
    const numeroIntento = previos + 1;
    const fila = await cargarEjercicio(tx, d.ejercicioId);
    const ejercicio = aEjercicio(fila);
    const correcta = esCorrecta(ejercicio, d.respuesta);
    const cerrado = correcta || numeroIntento >= MAX_INTENTOS;
    const conGuia = a.ayuda_actual || d.ayudaSolicitada;
    // Al agotar los 3 intentos se muestra la guía paso a paso completa con la respuesta (RF-11, RF-45)
    const guia: Guia | null = cerrado && !correcta ? { modo: "final", pasos: fila.pasos_solucion, respuestaCorrecta: respuestaLegible(ejercicio) } : null;
    const puntos = puntosPorEjercicio(correcta, numeroIntento, conGuia);

    // El trigger trg_intento_asignacion avanza la asignación al insertar. SAVEPOINT explícito: si el
    // clienteId ya es de otro alumno (RLS lo oculta arriba) el UNIQUE falla sin abortar la transacción.
    let id: string;
    await tx.$executeRaw`SAVEPOINT intento`;
    try {
        ({ id } = await tx.intento_ejercicio.create({
            data: {
                asignacion_id: a.id,
                alumno_id: alumnoId,
                ejercicio_id: d.ejercicioId,
                nivel: fila.nivel,
                respuesta: json({ valor: d.respuesta.slice(0, 600) }),
                correcta,
                tipo_error: correcta ? null : clasificarError(ejercicio, d.respuesta),
                numero_intento: numeroIntento,
                tiempo_ms: Math.round(Math.min(d.tiempoMs, 30 * 60_000)),
                ayuda_solicitada: conGuia,
                guia_mostrada: guia?.modo ?? (conGuia ? "paso_a_paso" : "ninguna"),
                cliente_id: d.clienteId,
            },
            select: { id: true },
        }));
        await tx.$executeRaw`RELEASE SAVEPOINT intento`;
    } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT intento`;
        if (errorBd(e)?.codigo === "23505") return { error: "cliente_repetido" };
        throw e;
    }

    let subioNivel: number | null = null;
    if (puntos > 0) {
        await tx.asignacion_alumno.update({ where: { id: a.id }, data: { puntaje: { increment: puntos } }, select: { id: true } });
        subioNivel = (await sumarPuntos(tx, alumnoId, puntos)).subioA;
    }

    // Estado tras el trigger (avance y posible cierre de la asignación)
    const despues = (await cargarAsignacion(tx, alumnoId, a.id))!;
    let nivel = { anterior: a.nivel_actual, actual: a.nivel_actual, motivo: null as MotivoAjuste | null };
    if (cerrado) {
        await tx.asignacion_alumno.update({ where: { id: a.id }, data: { ejercicio_actual_id: null, ayuda_actual: false }, select: { id: true } });
        if (despues.estado !== "completada") {
            const senales = await senalesNivel(tx, a, conGuia ? 1 : 0);
            const decision = decidirNivel({ nivelActual: a.nivel_actual, ...senales });
            if (decision.motivo && decision.nivelNuevo !== a.nivel_actual) {
                await tx.asignacion_alumno.update({ where: { id: a.id }, data: { nivel_actual: decision.nivelNuevo }, select: { id: true } });
                await tx.ajuste_dificultad.create({
                    data: {
                        asignacion_id: a.id,
                        alumno_id: alumnoId,
                        nivel_anterior: a.nivel_actual,
                        nivel_nuevo: decision.nivelNuevo,
                        motivo: decision.motivo,
                        detalle: json({ reglas: decision.reglas, IF: senales.indiceFrustracion, estadoVentana: senales.estadoVentana,
                                        ultimos3: senales.ultimos3, erroresConsecutivos: senales.erroresConsecutivos }),
                    },
                    select: { id: true },
                });
                nivel = { anterior: a.nivel_actual, actual: decision.nivelNuevo, motivo: decision.motivo };
            }
        }
    }

    // Insignias tras cada ejercicio cerrado (EXP-06.1): una sola vez cada una
    const nuevasInsignias = cerrado ? await otorgarInsignias(tx, alumnoId) : [];
    // IF en cada intento (EXP-05.4); sin muestras recientes de cámara se renormaliza sin E
    const evaluacion = despues.estado === "completada" ? null : await evaluarFrustracion(tx, alumnoId, a.id, 0, true);

    const resultado: ResultadoIntento = {
        correcta,
        puntos,
        ejercicioCerrado: cerrado,
        intentosRestantes: cerrado ? 0 : MAX_INTENTOS - numeroIntento,
        nivel,
        guia,
        asignacion: { estado: despues.estado, resueltos: despues.ejercicios_resueltos, total: despues.num_ejercicios },
        recompensa: despues.estado === "completada" ? recompensa({ puntaje: a.puntaje + puntos, resultado_final: despues.resultado_final }) : null,
        nuevasInsignias,
        subioNivel,
        ofrecerAyuda: evaluacion?.ofrecerAyuda ?? null,
    };
    await tx.intento_ejercicio.update({ where: { id }, data: { resultado: json(resultado) }, select: { id: true } });
    return resultado;
}
