// Diagnósticos de la sesión de clase del alumno (EXP-02: RF-54, RF-55, RF-61, RF-63).
// Todas las funciones reciben una transacción con contexto del alumno (RLS).
import { crearRng, semillaDeTexto } from "@numotion/core/dominio/aleatorio";
import { nivelDominio, siguienteNivel } from "@numotion/core/dominio/diagnostico";
import { combinacionDisponible, esCorrecta, generarParaDiagnostico } from "@numotion/core/dominio/contenido";
import { aPublico, type Ejercicio, type EjercicioPublico } from "@numotion/core/dominio/ejercicios";
import { calcularPanas, ESCALA_PANAS, esValorPanas, type Afecto } from "@numotion/core/dominio/panas";
import type { Prisma, Tx } from "../../infra/db";
import { estadoDiagnosticos } from "../core/sesion-alumno";

export { estadoDiagnosticos };

/** Crea o reanuda la sesión de clase del día (zona America/Tijuana). */
export async function sesionDelDia(tx: Tx, alumnoId: string): Promise<string> {
    // La fecha la calcula PostgreSQL en la zona de la escuela (fn_hoy_local): por eso es SQL y no upsert de Prisma
    const [s] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${alumnoId}::uuid, fn_hoy_local())
        ON CONFLICT (alumno_id, fecha) DO UPDATE SET ultima_actividad_en = now()
        RETURNING id`;
    return s.id;
}

async function config<T>(tx: Tx, clave: string, porDefecto: T): Promise<T> {
    const c = await tx.config_adaptativa.findUnique({ where: { clave }, select: { valor: true } });
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
    const items = await tx.panas_item.findMany({ where: { version }, orderBy: { orden: "asc" }, select: { id: true, orden: true, texto: true, audio_url: true } });
    const p = await tx.panas_resultado.findUnique({ where: { sesion_id: sesionId }, select: { respuestas: true, completado_en: true } });
    return {
        items: items.map(({ audio_url, ...i }) => ({ ...i, audioUrl: audio_url })),
        escala: ESCALA_PANAS.map((e) => ({ valor: e.valor, icono: e.icono, etiqueta: e.texto })),
        // Para retomar en el primer ítem sin responder (EXP-02.5)
        respondidos: ((p?.respuestas ?? []) as unknown as RespuestaGuardada[]).map((r) => r.itemId),
        completado: Boolean(p?.completado_en),
    };
}

export type ResultadoRespuestaPanas = "ok" | "valor_invalido" | "item_desconocido" | "completado";

/** Guardado incremental: responder de nuevo el mismo ítem reemplaza el valor. */
export async function responderPanas(tx: Tx, alumnoId: string, itemId: string, valor: unknown): Promise<ResultadoRespuestaPanas> {
    if (!esValorPanas(valor)) return "valor_invalido";
    const sesionId = await sesionDelDia(tx, alumnoId);
    const version = await config(tx, "panas_version", "v1");
    const item = await tx.panas_item.findFirst({ where: { id: itemId, version }, select: { id: true } });
    if (!item) return "item_desconocido";
    const nueva = [{ itemId, valor }];
    // Mezcla jsonb en una sola sentencia (reemplaza el ítem si ya estaba): SQL
    const filas = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO panas_resultado (sesion_id, alumno_id, respuestas) VALUES (${sesionId}::uuid, ${alumnoId}::uuid, ${JSON.stringify(nueva)}::jsonb)
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
    const p = await tx.panas_resultado.findUnique({ where: { sesion_id: sesionId }, select: { respuestas: true, completado_en: true } });
    if (p?.completado_en) return { ok: true };
    const version = await config(tx, "panas_version", "v1");
    const items: { id: string; afecto: Afecto }[] = await tx.panas_item.findMany({ where: { version }, select: { id: true, afecto: true } });
    const valores = new Map(((p?.respuestas ?? []) as unknown as RespuestaGuardada[]).map((r) => [r.itemId, r.valor]));
    const faltan = items.filter((i) => !valores.has(i.id)).length;
    if (!p || faltan > 0 || items.length === 0) return { ok: false, faltan: faltan || items.length };
    const { afectoPositivo, afectoNegativo } = calcularPanas(items.map((i) => ({ afecto: i.afecto, valor: valores.get(i.id)! })));
    await tx.panas_resultado.update({
        where: { sesion_id: sesionId },
        data: { afecto_positivo: afectoPositivo, afecto_negativo: afectoNegativo, completado_en: new Date() },
        select: { id: true },
    });
    return { ok: true };
}

// ───────────── Diagnóstico matemático (EXP-02.2, 02.5, 02.6) ─────────────

// A-20: mientras no exista el banco validado (T-01-04), las preguntas salen del contenido generado
// de las actividades, en su versión de selección múltiple (todos los temas la tienen, A-25/A-30).
const tieneDiagnostico = (clave: string) => combinacionDisponible(clave, "seleccion_multiple");

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
        const nivel = siguienteNivel(historial);
        if (nivel !== null) return { tipo: "nueva", tema, nivel, orden: tema.respuestas.length + 1 };
    }
    return { tipo: "terminado" };
}

async function planDelDia(tx: Tx, alumnoId: string, sesionId: string): Promise<TemaPlan[]> {
    const temas = await tx.$queryRaw<{ id: string; clave: string; nombre: string }[]>`
        SELECT t.id, t.clave, t.nombre
          FROM alumno a JOIN grupo g ON g.id = a.grupo_id
          JOIN tema t ON g.grado BETWEEN t.grado_min AND t.grado_max
         WHERE a.id = ${alumnoId}::uuid ORDER BY t.orden`;
    const filas = (await tx.diagnostico_mat_respuesta.findMany({
        where: { sesion_id: sesionId },
        orderBy: { orden: "asc" },
        select: { id: true, tema_id: true, orden: true, nivel: true, correcta: true, tiempo_ms: true, pregunta: true },
    })) as unknown as (FilaRespuesta & { tema_id: string })[];
    return temas
        .filter((t) => tieneDiagnostico(t.clave))
        .map((t) => ({ ...t, respuestas: filas.filter((f) => f.tema_id === t.id) }));
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
    const ejercicio = generarParaDiagnostico(paso.tema.clave, paso.nivel, rng)!;
    const fila = await tx.diagnostico_mat_respuesta.create({
        data: { sesion_id: sesionId, alumno_id: alumnoId, tema_id: paso.tema.id, orden: paso.orden, nivel: paso.nivel, pregunta: ejercicio as unknown as Prisma.InputJsonValue },
        select: { id: true },
    });
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
    const [f] = await tx.$queryRaw<{ pregunta: Ejercicio }[]>`
        SELECT r.pregunta FROM diagnostico_mat_respuesta r JOIN sesion_alumno s ON s.id = r.sesion_id
         WHERE r.id = ${preguntaId}::uuid AND r.alumno_id = ${alumnoId}::uuid AND r.respuesta IS NULL AND s.fecha = fn_hoy_local()`;
    if (!f) return null;
    const correcta = esCorrecta(f.pregunta, respuesta);
    await tx.diagnostico_mat_respuesta.update({
        where: { id: preguntaId },
        data: { respuesta, correcta, tiempo_ms: Math.round(tiempoMs), respondida_en: new Date() },
        select: { id: true },
    });
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
    const resultados = plan.map((tema) => {
        const historial = tema.respuestas.map((r) => ({ nivel: r.nivel, correcta: r.correcta as boolean }));
        const nivel = nivelDominio(historial);
        dominio[tema.clave] = nivel;
        return {
            sesion_id: sesionId,
            alumno_id: alumnoId,
            tema_id: tema.id,
            aciertos: historial.filter((h) => h.correcta).length,
            total: historial.length,
            nivel_dominio: nivel,
            tiempo_total_ms: tema.respuestas.reduce((s, r) => s + (r.tiempo_ms ?? 0), 0),
        };
    });
    // Idempotente: UNIQUE(sesion_id, tema_id)
    await tx.diagnostico_mat_resultado.createMany({ data: resultados, skipDuplicates: true });
    const [{ id }] = await tx.$queryRaw<{ id: string }[]>`SELECT fn_generar_retroalimentacion(${sesionId}::uuid) AS id`;
    return { ok: true, dominio, retroalimentacionId: id };
}
