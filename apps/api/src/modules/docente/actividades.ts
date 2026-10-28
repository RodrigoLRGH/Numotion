// Asignación de actividades (RF-56, RF-57), seguimiento (RF-58) e historial (RF-59).
// Todo corre en contexto docente: RLS limita a sus grupos, alumnos y actividades.
import { tiposDeTema, type TipoInteraccionActividad } from "@numotion/core/dominio/catalogo";
import { combinacionDisponible } from "@numotion/core/dominio/contenido";
import { codificarCursor, decodificarCursor } from "@numotion/core/dominio/cursor";
import type { Tx } from "../../infra/db";

export type Destino = { tipo: "grupo"; grupoId: string } | { tipo: "alumnos"; alumnoIds: string[] };

export interface NivelPrevisto {
    alumnoId: string;
    nombre: string;
    avatar: string;
    nivelInicial: number;
    sinDiagnostico: boolean;
    /** Estado inicial de la última retroalimentación: explica un nivel reducido por frustración */
    estadoInicial: string | null;
}

/** Niveles iniciales por alumno (paso 3 del asistente). null si el grupo o algún alumno no es del docente. */
export async function previsualizarNiveles(tx: Tx, temaId: string, destino: Destino): Promise<NivelPrevisto[] | null> {
    if (destino.tipo === "grupo") {
        const [g] = await tx`SELECT id FROM grupo WHERE id = ${destino.grupoId}`;
        if (!g) return null;
    }
    const ids = destino.tipo === "alumnos" ? [...new Set(destino.alumnoIds)] : [];
    const filas = await tx<NivelPrevisto[]>`
        SELECT a.id AS "alumnoId", trim(a.nombre || ' ' || a.apellidos) AS nombre, a.avatar,
               fn_nivel_inicial(a.id, ${temaId}) AS "nivelInicial",
               NOT EXISTS (SELECT 1 FROM diagnostico_mat_resultado d
                            WHERE d.alumno_id = a.id AND d.tema_id = ${temaId} AND d.creado_en > now() - interval '30 days') AS "sinDiagnostico",
               (SELECT r.estado_inicial FROM retroalimentacion r WHERE r.alumno_id = a.id ORDER BY r.creado_en DESC LIMIT 1) AS "estadoInicial"
          FROM alumno a
         WHERE a.activo AND ${destino.tipo === "grupo" ? tx`a.grupo_id = ${destino.grupoId}` : tx`a.id = ANY(${ids}::uuid[])`}
         ORDER BY a.nombre, a.apellidos`;
    if (destino.tipo === "alumnos" && filas.length !== ids.length) return null;
    return filas;
}

export interface DatosActividad {
    nombre: string;
    temaId: string;
    tipoInteraccion: TipoInteraccionActividad;
    fechaAsignacion: string;
    numEjercicios: number;
    destino: Destino;
}

export type ResultadoCrear =
    | { ok: true; actividadId: string; asignaciones: { alumnoId: string; nivelInicial: number; sinDiagnostico: boolean }[] }
    | { ok: false; status: 404 | 422; message: string };

/** Crea la actividad y sus asignaciones en una sola transacción (fn_registrar_asignacion). */
export async function crearActividad(tx: Tx, docenteId: string, d: DatosActividad): Promise<ResultadoCrear> {
    const [tema] = await tx`SELECT clave FROM tema WHERE id = ${d.temaId}`;
    if (!tema) return { ok: false, status: 404, message: "Tema no encontrado" };
    if (!tiposDeTema(tema.clave).includes(d.tipoInteraccion)) {
        return { ok: false, status: 422, message: "Ese tipo de ejercicio no está disponible para el tema" };
    }
    if (!combinacionDisponible(tema.clave, d.tipoInteraccion)) {
        return { ok: false, status: 422, message: "Todavía no hay ejercicios de ese tipo para el tema" };
    }
    const grupo = d.destino.tipo === "grupo" ? d.destino.grupoId : null;
    const alumnos = d.destino.tipo === "alumnos" ? [...new Set(d.destino.alumnoIds)] : [];
    const [{ id }] = await tx`
        SELECT fn_registrar_asignacion(${docenteId}, ${d.nombre}, ${d.temaId}, ${d.tipoInteraccion}, ${d.fechaAsignacion}::text::date,
                                       ${d.numEjercicios}::smallint, ${grupo}, ${alumnos}::uuid[]) AS id`;
    const asignaciones = await tx<{ alumnoId: string; nivelInicial: number; sinDiagnostico: boolean }[]>`
        SELECT s.alumno_id AS "alumnoId", s.nivel_inicial AS "nivelInicial",
               NOT EXISTS (SELECT 1 FROM diagnostico_mat_resultado dm
                            WHERE dm.alumno_id = s.alumno_id AND dm.tema_id = ${d.temaId} AND dm.creado_en > now() - interval '30 days') AS "sinDiagnostico"
          FROM asignacion_alumno s WHERE s.actividad_id = ${id}`;
    return { ok: true, actividadId: id, asignaciones };
}

// ───────────── Seguimiento (RF-58) ─────────────

export interface AlumnoEnActividad {
    alumnoId: string;
    nombre: string;
    avatar: string;
    estado: "pendiente" | "en_curso" | "completada";
    nivelInicial: number;
    nivelActual: number;
    resueltos: number;
    resultadoFinal: string | null;
}

export interface ActividadAsignada {
    actividadId: string;
    nombre: string;
    tema: string;
    tipoInteraccion: string;
    fechaAsignacion: string;
    numEjercicios: number;
    grupo: string | null;
    resumen: { pendiente: number; enCurso: number; completada: number };
    alumnos: AlumnoEnActividad[];
}

export interface Pagina<T> {
    items: T[];
    nextCursor: string | null;
}

export async function actividadesAsignadas(
    tx: Tx,
    f: { estado: "activas" | "todas"; grupoId?: string; cursor?: string | null; limite?: number },
): Promise<Pagina<ActividadAsignada>> {
    const limite = Math.min(f.limite ?? 20, 50);
    const desde = decodificarCursor(f.cursor);
    const filas = await tx`
        SELECT ac.id, ac.nombre, t.nombre AS tema, ac.tipo_interaccion, to_char(ac.fecha_asignacion, 'YYYY-MM-DD') AS fecha,
               ac.num_ejercicios, g.nombre AS grupo,
               count(*) FILTER (WHERE s.estado = 'pendiente')::int AS pendiente,
               count(*) FILTER (WHERE s.estado = 'en_curso')::int AS en_curso,
               count(*) FILTER (WHERE s.estado = 'completada')::int AS completada
          FROM actividad ac
          JOIN tema t ON t.id = ac.tema_id
          LEFT JOIN grupo g ON g.id = ac.grupo_id
          JOIN asignacion_alumno s ON s.actividad_id = ac.id
          JOIN alumno a ON a.id = s.alumno_id
         WHERE true
           ${f.grupoId ? tx`AND a.grupo_id = ${f.grupoId}` : tx``}
           ${desde ? tx`AND (ac.fecha_asignacion, ac.id) < (${desde.orden}::text::date, ${desde.id}::uuid)` : tx``}
         GROUP BY ac.id, t.nombre, g.nombre
        ${f.estado === "activas" ? tx`HAVING count(*) FILTER (WHERE s.estado <> 'completada') > 0` : tx``}
         ORDER BY ac.fecha_asignacion DESC, ac.id DESC
         LIMIT ${limite + 1}`;
    const pagina = filas.slice(0, limite);
    const ids = pagina.map((p) => p.id as string);
    const alumnos = ids.length
        ? await tx<(AlumnoEnActividad & { actividadId: string })[]>`
            SELECT s.actividad_id AS "actividadId", s.alumno_id AS "alumnoId", trim(a.nombre || ' ' || a.apellidos) AS nombre, a.avatar,
                   s.estado, s.nivel_inicial AS "nivelInicial", s.nivel_actual AS "nivelActual",
                   s.ejercicios_resueltos AS resueltos, s.resultado_final AS "resultadoFinal"
              FROM asignacion_alumno s JOIN alumno a ON a.id = s.alumno_id
             WHERE s.actividad_id = ANY(${ids}::uuid[])
               ${f.grupoId ? tx`AND a.grupo_id = ${f.grupoId}` : tx``}
             ORDER BY a.nombre, a.apellidos`
        : [];
    const ultimo = pagina.at(-1);
    return {
        items: pagina.map((p) => ({
            actividadId: p.id,
            nombre: p.nombre,
            tema: p.tema,
            tipoInteraccion: p.tipo_interaccion,
            fechaAsignacion: p.fecha,
            numEjercicios: p.num_ejercicios,
            grupo: p.grupo,
            resumen: { pendiente: p.pendiente, enCurso: p.en_curso, completada: p.completada },
            alumnos: alumnos.filter((a) => a.actividadId === p.id).map(({ actividadId: _, ...a }) => a),
        })),
        nextCursor: filas.length > limite && ultimo ? codificarCursor({ orden: ultimo.fecha, id: ultimo.id }) : null,
    };
}

// ───────────── Historial (RF-59) ─────────────

export interface EntradaHistorial {
    asignacionId: string;
    actividad: string;
    alumnoId: string;
    alumno: string;
    tema: string;
    completadaEn: Date;
    resultadoFinal: string | null;
    nivelInicial: number;
    nivelFinal: number;
    tiempoTotalMs: number;
}

export interface FiltrosHistorial {
    alumnoId?: string;
    temaId?: string;
    grupoId?: string;
    /** YYYY-MM-DD, inclusivas, en hora local de la escuela */
    desde?: string;
    hasta?: string;
    cursor?: string | null;
    limite?: number;
}

export async function historial(tx: Tx, f: FiltrosHistorial): Promise<Pagina<EntradaHistorial>> {
    const limite = Math.min(f.limite ?? 25, 100);
    const desde = decodificarCursor(f.cursor);
    const local = tx`(s.completada_en AT TIME ZONE 'America/Tijuana')::date`;
    const filas = await tx<(EntradaHistorial & { orden: string })[]>`
        SELECT s.id AS "asignacionId", ac.nombre AS actividad, a.id AS "alumnoId", trim(a.nombre || ' ' || a.apellidos) AS alumno,
               t.nombre AS tema, s.completada_en AS "completadaEn", s.resultado_final AS "resultadoFinal",
               s.nivel_inicial AS "nivelInicial", s.nivel_actual AS "nivelFinal",
               (SELECT coalesce(sum(i.tiempo_ms), 0) FROM intento_ejercicio i WHERE i.asignacion_id = s.id)::int AS "tiempoTotalMs",
               to_char(s.completada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS orden
          FROM asignacion_alumno s
          JOIN actividad ac ON ac.id = s.actividad_id
          JOIN alumno a ON a.id = s.alumno_id
          JOIN tema t ON t.id = ac.tema_id
         WHERE s.estado = 'completada'
           ${f.alumnoId ? tx`AND s.alumno_id = ${f.alumnoId}` : tx``}
           ${f.temaId ? tx`AND ac.tema_id = ${f.temaId}` : tx``}
           ${f.grupoId ? tx`AND a.grupo_id = ${f.grupoId}` : tx``}
           ${f.desde ? tx`AND ${local} >= ${f.desde}::text::date` : tx``}
           ${f.hasta ? tx`AND ${local} <= ${f.hasta}::text::date` : tx``}
           ${desde ? tx`AND (s.completada_en, s.id) < ((${desde.orden}::text::timestamp AT TIME ZONE 'UTC'), ${desde.id}::uuid)` : tx``}
         ORDER BY s.completada_en DESC, s.id DESC
         LIMIT ${limite + 1}`;
    const pagina = filas.slice(0, limite);
    const ultimo = pagina.at(-1);
    return {
        items: pagina.map(({ orden: _, ...e }) => e),
        nextCursor: filas.length > limite && ultimo ? codificarCursor({ orden: ultimo.orden, id: ultimo.asignacionId }) : null,
    };
}
