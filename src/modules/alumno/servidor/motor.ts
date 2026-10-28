// Motor de ejercicios de las actividades asignadas (EXP-04: RF-01, RF-03, RF-11, RF-21, RF-45, RF-47, RF-60).
// Todo en contexto del alumno (RLS). El avance de la asignación lo hace el trigger de BD; aquí se
// deciden puntos, guía y nivel, y se registra cada ajuste en ajuste_dificultad (ADR-005).
import { createHash } from "node:crypto";
import { decidirNivel, estadoVentana, indiceFrustracion, type MotivoAjuste } from "../../shared/dominio/adaptativo";
import { semillaDeTexto, crearRng } from "../../shared/dominio/aleatorio";
import type { TipoInteraccionActividad } from "../../shared/dominio/catalogo";
import { clasificarError, esCorrecta, generarParaActividad } from "../../shared/dominio/contenido";
import { textoParaHash } from "../../shared/dominio/respuesta";
import type { Ejercicio } from "../../shared/dominio/ejercicios";
import { estrellas, nivelGamificacion, puntosPorEjercicio } from "../../shared/dominio/puntos";
import type { Tx } from "../../shared/servidor/db";

export const MAX_INTENTOS = 4;

async function config<T>(tx: Tx, clave: string, porDefecto: T): Promise<T> {
    const [c] = await tx`SELECT valor FROM config_adaptativa WHERE clave = ${clave}`;
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
    resultadoFinal: string | null;
}

/** Asignaciones del alumno con fecha de hoy o anterior (A-28): en curso, pendientes y completadas. */
export async function misActividades(tx: Tx, alumnoId: string): Promise<ActividadAlumno[]> {
    return tx<ActividadAlumno[]>`
        SELECT s.id AS "asignacionId", ac.nombre, t.nombre AS tema, t.clave AS "temaClave", ac.tipo_interaccion AS "tipoInteraccion",
               to_char(ac.fecha_asignacion, 'YYYY-MM-DD') AS "fechaAsignacion", s.estado,
               json_build_object('resueltos', s.ejercicios_resueltos, 'total', ac.num_ejercicios) AS progreso,
               s.resultado_final AS "resultadoFinal"
          FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id JOIN tema t ON t.id = ac.tema_id
         WHERE s.alumno_id = ${alumnoId} AND ac.fecha_asignacion <= fn_hoy_local()
         ORDER BY CASE s.estado WHEN 'en_curso' THEN 0 WHEN 'pendiente' THEN 1 ELSE 2 END, ac.fecha_asignacion DESC, ac.nombre`;
}

// ───────────── Representación del ejercicio ─────────────

interface FilaEjercicio {
    id: string;
    nivel: number;
    tipo_interaccion: string;
    enunciado: { texto: string; expresion?: string; figuras?: Ejercicio["figuras"]; numeroMostrado?: number };
    opciones: string[] | null;
    respuesta: { valor: string; generador: Ejercicio["tema"]; datos: Ejercicio["datos"] };
    pasos_solucion: { orden: number; texto: string }[];
}

export interface EjercicioPublico {
    id: string;
    tipoInteraccion: string;
    nivel: number;
    enunciado: string;
    expresion?: string;
    figuras?: Ejercicio["figuras"];
    numeroMostrado?: number;
    opciones?: string[];
    /** SHA-256 de `${id}:${respuesta normalizada}`: validación optimista en el cliente (EXP-04.8) */
    hashRespuesta: string;
}

export function hashRespuesta(ejercicioId: string, valor: string): string {
    return createHash("sha256").update(textoParaHash(ejercicioId, valor)).digest("hex");
}

function aEjercicio(f: FilaEjercicio): Ejercicio {
    return {
        tema: f.respuesta.generador,
        nivel: f.nivel,
        interaccion: "seleccion_multiple",
        enunciado: f.enunciado.texto,
        expresion: f.enunciado.expresion,
        opciones: f.opciones ?? undefined,
        figuras: f.enunciado.figuras,
        numeroMostrado: f.enunciado.numeroMostrado,
        respuesta: f.respuesta.valor,
        pasos: f.pasos_solucion.map((p) => p.texto),
        datos: f.respuesta.datos,
    };
}

function aPublico(f: FilaEjercicio): EjercicioPublico {
    return {
        id: f.id,
        tipoInteraccion: f.tipo_interaccion,
        nivel: f.nivel,
        enunciado: f.enunciado.texto,
        ...(f.enunciado.expresion ? { expresion: f.enunciado.expresion } : {}),
        ...(f.enunciado.figuras ? { figuras: f.enunciado.figuras } : {}),
        ...(f.enunciado.numeroMostrado !== undefined ? { numeroMostrado: f.enunciado.numeroMostrado } : {}),
        ...(f.opciones ? { opciones: f.opciones } : {}),
        hashRespuesta: hashRespuesta(f.id, f.respuesta.valor),
    };
}

const cargarEjercicio = async (tx: Tx, id: string) =>
    (await tx<FilaEjercicio[]>`SELECT id, nivel, tipo_interaccion, enunciado, opciones, respuesta, pasos_solucion FROM ejercicio WHERE id = ${id}`)[0];

// ───────────── Asignación ─────────────

interface Asignacion {
    id: string;
    estado: "pendiente" | "en_curso" | "completada";
    nivel_inicial: number;
    nivel_actual: number;
    ejercicios_resueltos: number;
    puntaje: number;
    resultado_final: string | null;
    ejercicio_actual_id: string | null;
    ayuda_actual: boolean;
    tema_id: string;
    tema_clave: string;
    tipo_interaccion: TipoInteraccionActividad;
    num_ejercicios: number;
    nombre: string;
}

async function cargarAsignacion(tx: Tx, alumnoId: string, id: string, bloquear = false): Promise<Asignacion | null> {
    const filas = await tx<Asignacion[]>`
        SELECT s.id, s.estado, s.nivel_inicial, s.nivel_actual, s.ejercicios_resueltos, s.puntaje, s.resultado_final,
               s.ejercicio_actual_id, s.ayuda_actual, ac.tema_id, t.clave AS tema_clave, ac.tipo_interaccion, ac.num_ejercicios, ac.nombre
          FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id JOIN tema t ON t.id = ac.tema_id
         WHERE s.id = ${id} AND s.alumno_id = ${alumnoId} AND ac.fecha_asignacion <= fn_hoy_local()
        ${bloquear ? tx`FOR UPDATE OF s` : tx``}`;
    return filas[0] ?? null;
}

export interface Recompensa {
    puntos: number;
    estrellas: 1 | 2 | 3;
    resultadoFinal: number;
}

const recompensa = (a: Pick<Asignacion, "puntaje" | "resultado_final">): Recompensa => {
    const resultado = Number(a.resultado_final ?? 0);
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

/** Ejercicio vigente (retoma el que quedó abierto) o uno nuevo del tema, tipo y nivel actual (RF-21). */
export async function siguienteEjercicio(tx: Tx, alumnoId: string, asignacionId: string): Promise<Siguiente> {
    const a = await cargarAsignacion(tx, alumnoId, asignacionId, true);
    if (!a) return { error: "no_encontrada" };
    if (a.estado === "completada") return { completada: true, recompensa: recompensa(a), actividad: { nombre: a.nombre } };

    let fila: FilaEjercicio;
    let intentosUsados = 0;
    if (a.ejercicio_actual_id) {
        fila = await cargarEjercicio(tx, a.ejercicio_actual_id);
        [{ n: intentosUsados }] = await tx`SELECT count(*)::int AS n FROM intento_ejercicio WHERE asignacion_id = ${a.id} AND ejercicio_id = ${a.ejercicio_actual_id}`;
    } else {
        const [{ n: presentados }] = await tx`SELECT count(DISTINCT ejercicio_id)::int AS n FROM intento_ejercicio WHERE asignacion_id = ${a.id}`;
        const rng = crearRng(semillaDeTexto(`actividad|${a.id}|${presentados}|${a.nivel_actual}`));
        const e = generarParaActividad(a.tema_clave, a.tipo_interaccion, a.nivel_actual, rng);
        if (!e) return { error: "sin_contenido" };
        [fila] = await tx<FilaEjercicio[]>`
            INSERT INTO ejercicio (tema_id, tipo_interaccion, nivel, enunciado, respuesta, opciones, pasos_solucion, origen)
            VALUES (${a.tema_id}, ${a.tipo_interaccion}, ${a.nivel_actual},
                    ${tx.json({ texto: e.enunciado, expresion: e.expresion, figuras: e.figuras, numeroMostrado: e.numeroMostrado } as never)},
                    ${tx.json({ valor: e.respuesta, generador: e.tema, datos: e.datos } as never)},
                    ${e.opciones ? tx.json(e.opciones) : null},
                    ${tx.json(e.pasos.map((texto, i) => ({ orden: i + 1, texto })))}, 'generador')
            RETURNING id, nivel, tipo_interaccion, enunciado, opciones, respuesta, pasos_solucion`;
        await tx`UPDATE asignacion_alumno SET ejercicio_actual_id = ${fila.id}, ayuda_actual = false WHERE id = ${a.id}`;
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
export async function iniciarActividad(tx: Tx, alumnoId: string, asignacionId: string): Promise<Siguiente> {
    const a = await cargarAsignacion(tx, alumnoId, asignacionId, true);
    if (!a) return { error: "no_encontrada" };
    if (a.estado === "pendiente" && !a.ejercicio_actual_id) {
        const [{ nivel }] = await tx`SELECT fn_nivel_inicial(${alumnoId}, ${a.tema_id}) AS nivel`;
        if (nivel !== a.nivel_actual) {
            await tx`UPDATE asignacion_alumno SET nivel_actual = ${nivel} WHERE id = ${a.id}`;
            await tx`INSERT INTO ajuste_dificultad (asignacion_id, alumno_id, nivel_anterior, nivel_nuevo, motivo, detalle)
                     VALUES (${a.id}, ${alumnoId}, ${a.nivel_actual}, ${nivel}, 'inicial', ${tx.json({ regla: "diagnostico_del_dia" })})`;
        }
    }
    return siguienteEjercicio(tx, alumnoId, asignacionId);
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
    await tx`UPDATE asignacion_alumno SET ayuda_actual = true WHERE id = ${a.id}`;
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
}

export type FalloIntento = { error: "no_encontrada" | "completada" | "ejercicio_no_vigente" | "cliente_repetido" };

async function senalesNivel(tx: Tx, alumnoId: string, a: Asignacion, ayudas: number) {
    const ultimos = await tx<{ correcto: boolean; primero: boolean; tiempo: number; fin: Date }[]>`
        SELECT bool_or(correcta) AS correcto, bool_or(correcta AND numero_intento = 1) AS primero,
               sum(tiempo_ms)::int AS tiempo, max(creado_en) AS fin
          FROM intento_ejercicio WHERE asignacion_id = ${a.id}
         GROUP BY ejercicio_id HAVING bool_or(correcta) OR max(numero_intento) >= ${MAX_INTENTOS}
         ORDER BY max(creado_en) DESC`;
    const intentos = await tx<{ correcta: boolean }[]>`
        SELECT correcta FROM intento_ejercicio WHERE asignacion_id = ${a.id} ORDER BY creado_en DESC, numero_intento DESC LIMIT 20`;
    const errores = intentos.findIndex((i) => i.correcta);
    const [ultimoCambio] = await tx`SELECT max(creado_en) AS t FROM ajuste_dificultad WHERE asignacion_id = ${a.id}`;
    const desde: Date | null = ultimoCambio?.t ?? null;
    const [{ acepto }] = await tx`
        SELECT EXISTS (SELECT 1 FROM alerta WHERE asignacion_id = ${a.id} AND alumno_acepto_ayuda
                         AND creado_en > coalesce(${desde}::timestamptz, '-infinity')) AS acepto`;
    const ventana = await config(tx, "ventana_seg", 60);
    const muestras = await tx<{ estado_derivado: string; emocion: string }[]>`SELECT * FROM fn_estados_recientes(${ventana})`;
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
        aceptoAyuda: acepto as boolean,
        tiempoReferenciaMs: await config(tx, "tiempo_referencia_ms", 30_000),
        umbralAlerta: await config(tx, "umbral_alerta", 0.6),
    };
}

export async function registrarIntento(tx: Tx, alumnoId: string, d: DatosIntento): Promise<ResultadoIntento | FalloIntento> {
    // Idempotencia: el mismo clienteId devuelve la misma respuesta
    const [previo] = await tx`SELECT resultado FROM intento_ejercicio WHERE cliente_id = ${d.clienteId}`;
    if (previo?.resultado) return previo.resultado as ResultadoIntento;

    const a = await cargarAsignacion(tx, alumnoId, d.asignacionId, true);
    if (!a) return { error: "no_encontrada" };
    if (a.estado === "completada") return { error: "completada" };
    if (a.ejercicio_actual_id !== d.ejercicioId) return { error: "ejercicio_no_vigente" };

    const [{ n: previos }] = await tx`SELECT count(*)::int AS n FROM intento_ejercicio WHERE asignacion_id = ${a.id} AND ejercicio_id = ${d.ejercicioId}`;
    const numeroIntento = previos + 1;
    const fila = await cargarEjercicio(tx, d.ejercicioId);
    const ejercicio = aEjercicio(fila);
    const correcta = esCorrecta(ejercicio, d.respuesta);
    const cerrado = correcta || numeroIntento >= MAX_INTENTOS;
    const conGuia = a.ayuda_actual || d.ayudaSolicitada;
    const guia: Guia | null =
        cerrado && !correcta
            ? { modo: "final", pasos: fila.pasos_solucion, respuestaCorrecta: ejercicio.respuesta }
            : !correcta && numeroIntento === 3
              ? { modo: "paso_a_paso", pasos: fila.pasos_solucion }
              : null;
    const puntos = puntosPorEjercicio(correcta, numeroIntento, conGuia);

    let id: string;
    try {
        [{ id }] = await tx.savepoint((sp) => sp`
            INSERT INTO intento_ejercicio (asignacion_id, alumno_id, ejercicio_id, nivel, respuesta, correcta, tipo_error, numero_intento,
                                           tiempo_ms, ayuda_solicitada, guia_mostrada, cliente_id)
            VALUES (${a.id}, ${alumnoId}, ${d.ejercicioId}, ${fila.nivel}, ${tx.json({ valor: d.respuesta.slice(0, 200) })}, ${correcta},
                    ${correcta ? null : clasificarError(ejercicio, d.respuesta)}, ${numeroIntento}, ${Math.round(Math.min(d.tiempoMs, 30 * 60_000))},
                    ${conGuia}, ${guia?.modo ?? (conGuia ? "paso_a_paso" : "ninguna")}, ${d.clienteId})
            RETURNING id`);
    } catch (e) {
        // clienteId usado en un intento que no es de este alumno (RLS lo oculta en la búsqueda de arriba)
        if ((e as { code?: string }).code === "23505") return { error: "cliente_repetido" };
        throw e;
    }

    if (puntos > 0) {
        await tx`UPDATE asignacion_alumno SET puntaje = puntaje + ${puntos} WHERE id = ${a.id}`;
        const [p] = await tx`UPDATE perfil_gamificacion SET puntos_totales = puntos_totales + ${puntos} WHERE alumno_id = ${alumnoId} RETURNING puntos_totales`;
        if (p) await tx`UPDATE perfil_gamificacion SET nivel_gamificacion = ${nivelGamificacion(p.puntos_totales)} WHERE alumno_id = ${alumnoId}`;
    }

    // Estado tras el trigger (avance y posible cierre de la asignación)
    const despues = (await cargarAsignacion(tx, alumnoId, a.id))!;
    let nivel = { anterior: a.nivel_actual, actual: a.nivel_actual, motivo: null as MotivoAjuste | null };
    if (cerrado) {
        await tx`UPDATE asignacion_alumno SET ejercicio_actual_id = NULL, ayuda_actual = false WHERE id = ${a.id}`;
        if (despues.estado !== "completada") {
            const senales = await senalesNivel(tx, alumnoId, a, conGuia ? 1 : 0);
            const decision = decidirNivel({ nivelActual: a.nivel_actual, ...senales });
            if (decision.motivo && decision.nivelNuevo !== a.nivel_actual) {
                await tx`UPDATE asignacion_alumno SET nivel_actual = ${decision.nivelNuevo} WHERE id = ${a.id}`;
                await tx`INSERT INTO ajuste_dificultad (asignacion_id, alumno_id, nivel_anterior, nivel_nuevo, motivo, detalle)
                         VALUES (${a.id}, ${alumnoId}, ${a.nivel_actual}, ${decision.nivelNuevo}, ${decision.motivo},
                                 ${tx.json({ reglas: decision.reglas, IF: senales.indiceFrustracion, estadoVentana: senales.estadoVentana,
                                             ultimos3: senales.ultimos3, erroresConsecutivos: senales.erroresConsecutivos } as never)})`;
                nivel = { anterior: a.nivel_actual, actual: decision.nivelNuevo, motivo: decision.motivo };
            }
        }
    }

    const resultado: ResultadoIntento = {
        correcta,
        puntos,
        ejercicioCerrado: cerrado,
        intentosRestantes: cerrado ? 0 : MAX_INTENTOS - numeroIntento,
        nivel,
        guia,
        asignacion: { estado: despues.estado, resueltos: despues.ejercicios_resueltos, total: despues.num_ejercicios },
        recompensa: despues.estado === "completada" ? recompensa({ puntaje: a.puntaje + puntos, resultado_final: despues.resultado_final }) : null,
    };
    await tx`UPDATE intento_ejercicio SET resultado = ${tx.json(resultado as never)} WHERE id = ${id}`;
    return resultado;
}
