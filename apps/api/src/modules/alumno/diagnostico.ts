// Diagnósticos de la sesión de clase del alumno (EXP-02: RF-54, RF-55, RF-61, RF-63).
// Todas las funciones reciben una transacción con contexto del alumno (RLS).
import { crearRng, semillaDeTexto } from "@numotion/core/dominio/aleatorio";
import { nivelDominio, siguienteNivel, MIN_PREGUNTAS_TEMA, type Modo } from "@numotion/core/dominio/diagnostico";
import { aPublico, evaluarRespuesta, generarEjercicio, type ClaveTema, type Ejercicio, type EjercicioPublico } from "@numotion/core/dominio/ejercicios";
import { calcularPanas, ESCALA_PANAS, esValorPanas, type Afecto } from "@numotion/core/dominio/panas";
import type { Tx } from "../../infra/db";
import { estadoDiagnosticos } from "../core/sesion-alumno";

export { estadoDiagnosticos };

/** Crea o reanuda la sesión de clase del día (zona America/Tijuana). */
export async function sesionDelDia(tx: Tx, alumnoId: string): Promise<string> {
    const [s] = await tx`
        INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${alumnoId}, fn_hoy_local())
        ON CONFLICT (alumno_id, fecha) DO UPDATE SET ultima_actividad_en = now()
        RETURNING id`;
    return s.id;
}

async function config<T>(tx: Tx, clave: string, porDefecto: T): Promise<T> {
    const [c] = await tx`SELECT valor FROM config_adaptativa WHERE clave = ${clave}`;
    return (c?.valor as T | undefined) ?? porDefecto;
}

// ───────────── PANAS-C (EXP-02.1) ─────────────

interface RespuestaGuardada {
    itemId: string;
    valor: number;
}

export async function panasDelDia(tx: Tx, alumnoId: string) {
    const sesionId = await sesionDelDia(tx, alumnoId);
    const version = await config(tx, "panas_version", "v1");
    const items = await tx`SELECT id, orden, texto, audio_url AS "audioUrl" FROM panas_item WHERE version = ${version} ORDER BY orden`;
    const [p] = await tx`SELECT respuestas, completado_en FROM panas_resultado WHERE sesion_id = ${sesionId}`;
    return {
        items,
        escala: ESCALA_PANAS.map((e) => ({ valor: e.valor, icono: e.icono, etiqueta: e.texto })),
        // Para retomar en el primer ítem sin responder (EXP-02.5)
        respondidos: ((p?.respuestas ?? []) as RespuestaGuardada[]).map((r) => r.itemId),
        completado: Boolean(p?.completado_en),
    };
}

export type ResultadoRespuestaPanas = "ok" | "valor_invalido" | "item_desconocido" | "completado";

/** Guardado incremental: responder de nuevo el mismo ítem reemplaza el valor. */
export async function responderPanas(tx: Tx, alumnoId: string, itemId: string, valor: unknown): Promise<ResultadoRespuestaPanas> {
    if (!esValorPanas(valor)) return "valor_invalido";
    const sesionId = await sesionDelDia(tx, alumnoId);
    const version = await config(tx, "panas_version", "v1");
    const [item] = await tx`SELECT id FROM panas_item WHERE id = ${itemId} AND version = ${version}`;
    if (!item) return "item_desconocido";
    const nueva = [{ itemId, valor }];
    const filas = await tx`
        INSERT INTO panas_resultado (sesion_id, alumno_id, respuestas) VALUES (${sesionId}, ${alumnoId}, ${tx.json(nueva)})
        ON CONFLICT (sesion_id) DO UPDATE
           SET respuestas = (SELECT coalesce(jsonb_agg(e), '[]'::jsonb) FROM jsonb_array_elements(panas_resultado.respuestas) e
                              WHERE e->>'itemId' <> ${itemId}) || EXCLUDED.respuestas
         WHERE panas_resultado.completado_en IS NULL
        RETURNING id`;
    return filas.length ? "ok" : "completado";
}

/** Calcula AP/AN y cierra el PANAS del día. Idempotente. */
export async function finalizarPanas(tx: Tx, alumnoId: string): Promise<{ ok: true } | { ok: false; faltan: number }> {
    const sesionId = await sesionDelDia(tx, alumnoId);
    const [p] = await tx`SELECT respuestas, completado_en FROM panas_resultado WHERE sesion_id = ${sesionId}`;
    if (p?.completado_en) return { ok: true };
    const version = await config(tx, "panas_version", "v1");
    const items = await tx<{ id: string; afecto: Afecto }[]>`SELECT id, afecto FROM panas_item WHERE version = ${version}`;
    const valores = new Map(((p?.respuestas ?? []) as RespuestaGuardada[]).map((r) => [r.itemId, r.valor]));
    const faltan = items.filter((i) => !valores.has(i.id)).length;
    if (!p || faltan > 0 || items.length === 0) return { ok: false, faltan: faltan || items.length };
    const { afectoPositivo, afectoNegativo } = calcularPanas(items.map((i) => ({ afecto: i.afecto, valor: valores.get(i.id)! })));
    await tx`UPDATE panas_resultado SET afecto_positivo = ${afectoPositivo}, afecto_negativo = ${afectoNegativo}, completado_en = now()
             WHERE sesion_id = ${sesionId}`;
    return { ok: true };
}

// ───────────── Diagnóstico matemático (EXP-02.2, 02.5, 02.6) ─────────────

// A-20: mientras no exista el banco validado (T-01-04), las preguntas salen del generador
// determinista. Los temas sin generador (geometría, fracciones) no se diagnostican aún.
const GENERADOR_POR_TEMA: Record<string, ClaveTema> = {
    numeros: "identificar_numero",
    suma: "suma",
    resta: "resta",
    multiplicacion: "multiplicacion",
    division: "division",
};

interface FilaRespuesta {
    id: string;
    orden: number;
    nivel: number;
    correcta: boolean | null;
    tiempo_ms: number | null;
    pregunta: Ejercicio;
}

export interface TemaPlan {
    id: string;
    clave: string;
    nombre: string;
    modo: Modo;
    respuestas: FilaRespuesta[];
}

export type Paso =
    | { tipo: "pendiente"; tema: TemaPlan; fila: FilaRespuesta }
    | { tipo: "nueva"; tema: TemaPlan; nivel: number; orden: number }
    | { tipo: "terminado" };

/** Decide el siguiente paso: retomar la pregunta pendiente, presentar una nueva o terminar. */
export function pasoSiguiente(plan: readonly TemaPlan[]): Paso {
    for (const tema of plan) {
        const pendiente = tema.respuestas.find((r) => r.correcta === null);
        if (pendiente) return { tipo: "pendiente", tema, fila: pendiente };
    }
    for (const tema of plan) {
        const historial = tema.respuestas.map((r) => ({ nivel: r.nivel, correcta: r.correcta as boolean }));
        const nivel = siguienteNivel(historial, tema.modo);
        if (nivel !== null) return { tipo: "nueva", tema, nivel, orden: tema.respuestas.length + 1 };
    }
    return { tipo: "terminado" };
}

async function planDelDia(tx: Tx, alumnoId: string, sesionId: string): Promise<TemaPlan[]> {
    const temas = await tx<{ id: string; clave: string; nombre: string }[]>`
        SELECT t.id, t.clave, t.nombre
          FROM alumno a JOIN grupo g ON g.id = a.grupo_id
          JOIN tema t ON g.grado BETWEEN t.grado_min AND t.grado_max
         WHERE a.id = ${alumnoId} ORDER BY t.orden`;
    const dias = await config(tx, "diagnostico_corto_dias", 7);
    // EXP-02.6: versión corta si hubo un diagnóstico completo del tema en los últimos N días
    const previos = await tx<{ tema_id: string; nivel: number; hubo_completo: boolean }[]>`
        SELECT d.tema_id,
               (array_agg(d.nivel_dominio ORDER BY d.creado_en DESC))[1] AS nivel,
               bool_or(d.total >= ${MIN_PREGUNTAS_TEMA}) AS hubo_completo
          FROM diagnostico_mat_resultado d
         WHERE d.alumno_id = ${alumnoId} AND d.sesion_id <> ${sesionId}
           AND d.creado_en > now() - make_interval(days => ${dias})
         GROUP BY d.tema_id`;
    const filas = await tx<(FilaRespuesta & { tema_id: string })[]>`
        SELECT id, tema_id, orden, nivel, correcta, tiempo_ms, pregunta
          FROM diagnostico_mat_respuesta WHERE sesion_id = ${sesionId} ORDER BY orden`;
    return temas
        .filter((t) => t.clave in GENERADOR_POR_TEMA)
        .map((t) => {
            const previo = previos.find((p) => p.tema_id === t.id && p.hubo_completo);
            return {
                ...t,
                modo: previo ? { tipo: "corto" as const, nivel: previo.nivel } : { tipo: "completo" as const },
                respuestas: filas.filter((f) => f.tema_id === t.id),
            };
        });
}

export interface PreguntaPublica extends EjercicioPublico {
    id: string;
}

export type SiguientePregunta =
    | { pregunta: PreguntaPublica; temaId: string; progreso: { temasCompletados: number; temas: number } }
    | { terminado: true }
    | { error: "panas_pendiente" };

function progreso(plan: readonly TemaPlan[], actual: TemaPlan) {
    return { temasCompletados: plan.indexOf(actual), temas: plan.length };
}

export async function siguientePregunta(tx: Tx, alumnoId: string): Promise<SiguientePregunta> {
    if (!(await estadoDiagnosticos(tx)).panas) return { error: "panas_pendiente" };
    const sesionId = await sesionDelDia(tx, alumnoId);
    const plan = await planDelDia(tx, alumnoId, sesionId);
    const paso = pasoSiguiente(plan);
    if (paso.tipo === "terminado") return { terminado: true };
    if (paso.tipo === "pendiente") {
        return { pregunta: { id: paso.fila.id, ...aPublico(paso.fila.pregunta) }, temaId: paso.tema.id, progreso: progreso(plan, paso.tema) };
    }
    // Semilla fija por (sesión, tema, orden): la misma pregunta si se pide dos veces
    const rng = crearRng(semillaDeTexto(`diagnostico|${sesionId}|${paso.tema.id}|${paso.orden}`));
    const ejercicio = generarEjercicio(GENERADOR_POR_TEMA[paso.tema.clave], paso.nivel, "seleccion_multiple", rng);
    const [fila] = await tx`
        INSERT INTO diagnostico_mat_respuesta (sesion_id, alumno_id, tema_id, orden, nivel, pregunta)
        VALUES (${sesionId}, ${alumnoId}, ${paso.tema.id}, ${paso.orden}, ${paso.nivel}, ${tx.json(ejercicio as never)})
        RETURNING id`;
    return { pregunta: { id: fila.id, ...aPublico(ejercicio) }, temaId: paso.tema.id, progreso: progreso(plan, paso.tema) };
}

/** Califica en servidor; no revela la respuesta correcta. null si la pregunta no está pendiente hoy. */
export async function responderPregunta(
    tx: Tx,
    alumnoId: string,
    preguntaId: string,
    respuesta: string,
    tiempoMs: number,
): Promise<{ correcta: boolean } | null> {
    const [f] = await tx<{ pregunta: Ejercicio }[]>`
        SELECT r.pregunta FROM diagnostico_mat_respuesta r JOIN sesion_alumno s ON s.id = r.sesion_id
         WHERE r.id = ${preguntaId} AND r.alumno_id = ${alumnoId} AND r.respuesta IS NULL AND s.fecha = fn_hoy_local()`;
    if (!f) return null;
    const { correcta } = evaluarRespuesta(f.pregunta, respuesta);
    await tx`UPDATE diagnostico_mat_respuesta
                SET respuesta = ${respuesta}, correcta = ${correcta}, tiempo_ms = ${Math.round(tiempoMs)}, respondida_en = now()
              WHERE id = ${preguntaId}`;
    return { correcta };
}

export type FinDiagnostico =
    | { ok: true; dominio: Record<string, number>; retroalimentacionId: string }
    | { ok: false; motivo: "panas_pendiente" | "incompleto" };

/** Registra el dominio por tema y genera la retroalimentación de la sesión (RF-61). Idempotente. */
export async function finalizarMatematico(tx: Tx, alumnoId: string): Promise<FinDiagnostico> {
    if (!(await estadoDiagnosticos(tx)).panas) return { ok: false, motivo: "panas_pendiente" };
    const sesionId = await sesionDelDia(tx, alumnoId);
    const plan = await planDelDia(tx, alumnoId, sesionId);
    if (pasoSiguiente(plan).tipo !== "terminado") return { ok: false, motivo: "incompleto" };

    const dominio: Record<string, number> = {};
    for (const tema of plan) {
        const historial = tema.respuestas.map((r) => ({ nivel: r.nivel, correcta: r.correcta as boolean }));
        const nivel = nivelDominio(historial, tema.modo);
        dominio[tema.clave] = nivel;
        await tx`
            INSERT INTO diagnostico_mat_resultado (sesion_id, alumno_id, tema_id, aciertos, total, nivel_dominio, tiempo_total_ms)
            VALUES (${sesionId}, ${alumnoId}, ${tema.id}, ${historial.filter((h) => h.correcta).length}, ${historial.length},
                    ${nivel}, ${tema.respuestas.reduce((s, r) => s + (r.tiempo_ms ?? 0), 0)})
            ON CONFLICT (sesion_id, tema_id) DO NOTHING`;
    }
    const [{ id }] = await tx`SELECT fn_generar_retroalimentacion(${sesionId}) AS id`;
    return { ok: true, dominio, retroalimentacionId: id };
}
