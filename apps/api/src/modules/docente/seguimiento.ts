// Panel y seguimiento del docente (EXP-07: RF-14, RF-62, RF-29, RF-19, RF-35, RF-52, RF-50, RF-18).
// Todo corre en contexto docente: RLS limita a los alumnos de sus grupos; un alumno o grupo ajeno
// simplemente no existe (404). Los textos describen señales observadas, no diagnósticos.
import { nombreTipo } from "@numotion/core/dominio/catalogo";
import { num, Prisma, type Tx } from "../../infra/db";

const ESTADOS = ["positivo", "neutral", "frustracion", "desinteres"] as const;

const hoy = async (tx: Tx) => (await tx.$queryRaw<{ hoy: string }[]>`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`)[0].hoy;

async function temas(tx: Tx) {
    return tx.tema.findMany({ select: { id: true, clave: true, nombre: true, orden: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
}

/** dominio_por_tema llega como {temaId: nivel}; se traduce a {clave: nivel} para la vista. */
function porClave(dominio: unknown, mapa: Map<string, string>): Record<string, number> {
    const r: Record<string, number> = {};
    if (dominio && typeof dominio === "object") for (const [id, n] of Object.entries(dominio as Record<string, unknown>)) {
        const clave = mapa.get(id);
        if (clave && Number.isFinite(Number(n))) r[clave] = Number(n);
    }
    return r;
}

const redondear = (v: number | null, d = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
const promedio = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

// ───────────── Resumen previo (RF-14, RF-62, EXP-07.1) ─────────────

export interface AlumnoResumen {
    alumnoId: string;
    nombre: string;
    avatar: string;
    estadoInicial: string | null;
    afectoPositivo: number | null;
    afectoNegativo: number | null;
    dominioPorTema: Record<string, number>;
    observaciones: string[];
    fechaDato: string | null;
    sinDatosHoy: boolean;
    alertasPendientes: number;
    camara: boolean;
}

export interface ResumenGrupo {
    fecha: string;
    grupo: {
        id: string;
        nombre: string;
        conDiagnosticoHoy: number;
        total: number;
        distribucion: Record<(typeof ESTADOS)[number] | "sinDatos", number>;
        afectoPositivoProm: number | null;
        afectoNegativoProm: number | null;
        dominioPromPorTema: Record<string, number>;
    };
    temas: { clave: string; nombre: string }[];
    alumnos: AlumnoResumen[];
}

export async function resumenGrupo(tx: Tx, grupoId: string, fecha?: string): Promise<ResumenGrupo | null> {
    const g = await tx.grupo.findUnique({ where: { id: grupoId }, select: { id: true, nombre: true } });
    if (!g) return null;
    const dia = fecha ?? (await hoy(tx));
    const listaTemas = await temas(tx);
    const mapa = new Map(listaTemas.map((t) => [t.id, t.clave]));
    // Último dato de cada alumno hasta la fecha (A-09: "sin datos hoy" con la fecha del último)
    const filas = await tx.$queryRaw<{
        alumno_id: string; nombre: string; avatar: string; estado: string | null; ap: Prisma.Decimal | null; an: Prisma.Decimal | null;
        dominio: unknown; observaciones: string[] | null; fecha: string | null; alertas: number; camara: boolean;
    }[]>`
        SELECT a.id AS alumno_id, trim(a.nombre || ' ' || a.apellidos) AS nombre, a.avatar,
               u.estado_inicial::text AS estado, u.ap, u.an, u.dominio_por_tema AS dominio, u.observaciones, u.fecha,
               (SELECT count(*)::int FROM alerta al WHERE al.alumno_id = a.id AND al.atendida_en IS NULL) AS alertas,
               EXISTS (SELECT 1 FROM consentimiento_tutor c WHERE c.alumno_id = a.id AND c.aceptado_en IS NOT NULL
                        AND c.revocado_en IS NULL AND c.acepta_camara) AS camara
          FROM alumno a
          LEFT JOIN LATERAL (
            SELECT r.estado_inicial, p.afecto_positivo AS ap, p.afecto_negativo AS an, r.dominio_por_tema, r.observaciones,
                   to_char(s.fecha, 'YYYY-MM-DD') AS fecha
              FROM retroalimentacion r JOIN sesion_alumno s ON s.id = r.sesion_id
              LEFT JOIN panas_resultado p ON p.id = r.panas_id
             WHERE r.alumno_id = a.id AND s.fecha <= ${dia}::text::date
             ORDER BY s.fecha DESC, r.creado_en DESC LIMIT 1) u ON true
         WHERE a.grupo_id = ${grupoId}::uuid AND a.activo
         ORDER BY a.nombre, a.apellidos`;
    const alumnos: AlumnoResumen[] = filas.map((f) => ({
        alumnoId: f.alumno_id,
        nombre: f.nombre,
        avatar: f.avatar,
        estadoInicial: f.estado,
        afectoPositivo: num(f.ap),
        afectoNegativo: num(f.an),
        dominioPorTema: porClave(f.dominio, mapa),
        observaciones: f.observaciones ?? [],
        fechaDato: f.fecha,
        sinDatosHoy: f.fecha !== dia,
        alertasPendientes: f.alertas,
        camara: f.camara,
    }));
    const deHoy = alumnos.filter((a) => !a.sinDatosHoy);
    const distribucion = { positivo: 0, neutral: 0, frustracion: 0, desinteres: 0, sinDatos: alumnos.length - deHoy.length };
    for (const a of deHoy) if (a.estadoInicial && a.estadoInicial in distribucion) distribucion[a.estadoInicial as (typeof ESTADOS)[number]]++;
    const dominioPromPorTema: Record<string, number> = {};
    for (const t of listaTemas) {
        const v = deHoy.map((a) => a.dominioPorTema[t.clave]).filter((x): x is number => x !== undefined);
        const p = redondear(promedio(v), 1);
        if (p !== null) dominioPromPorTema[t.clave] = p;
    }
    return {
        fecha: dia,
        grupo: {
            id: g.id,
            nombre: g.nombre,
            conDiagnosticoHoy: deHoy.length,
            total: alumnos.length,
            distribucion,
            afectoPositivoProm: redondear(promedio(deHoy.map((a) => a.afectoPositivo).filter((x): x is number => x !== null))),
            afectoNegativoProm: redondear(promedio(deHoy.map((a) => a.afectoNegativo).filter((x): x is number => x !== null))),
            dominioPromPorTema,
        },
        temas: listaTemas.filter((t) => t.clave in dominioPromPorTema || alumnos.some((a) => t.clave in a.dominioPorTema)).map((t) => ({ clave: t.clave, nombre: t.nombre })),
        alumnos,
    };
}

// ───────────── Ficha del alumno (RF-29, EXP-07.2) ─────────────

export interface Ficha {
    datos: { id: string; nombre: string; apellidos: string; avatar: string; grupoId: string; grupo: string; grado: number; camara: boolean };
    estadoEmocionalReciente: {
        estadoInicial: string | null;
        afectoPositivo: number | null;
        afectoNegativo: number | null;
        fecha: string | null;
        observaciones: string[];
        /** Serie de la última sesión con cámara: solo estados derivados, nunca imágenes */
        serie: { capturadoEn: string; estado: string }[];
    };
    ultimasNotas: Nota[];
    resumenDesempeno: {
        completadas: number;
        enCurso: number;
        pendientes: number;
        promedioResultado: number | null;
        puntos: number;
        nivelGamificacion: number;
        racha: { actual: number; mejor: number };
        alertasPendientes: number;
    };
}

export async function ficha(tx: Tx, alumnoId: string): Promise<Ficha | null> {
    const a = await tx.alumno.findUnique({
        where: { id: alumnoId },
        select: { id: true, nombre: true, apellidos: true, avatar: true, grupo: { select: { id: true, nombre: true, grado: true } } },
    });
    if (!a) return null;
    const [r] = await tx.$queryRaw<{ estado: string | null; ap: Prisma.Decimal | null; an: Prisma.Decimal | null; fecha: string; observaciones: string[] }[]>`
        SELECT r.estado_inicial::text AS estado, p.afecto_positivo AS ap, p.afecto_negativo AS an, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, r.observaciones
          FROM retroalimentacion r JOIN sesion_alumno s ON s.id = r.sesion_id LEFT JOIN panas_resultado p ON p.id = r.panas_id
         WHERE r.alumno_id = ${alumnoId}::uuid ORDER BY s.fecha DESC, r.creado_en DESC LIMIT 1`;
    const serie = await tx.$queryRaw<{ capturadoEn: Date; estado: string }[]>`
        SELECT e.capturado_en AS "capturadoEn", e.estado_derivado::text AS estado FROM evento_emocional e
         WHERE e.alumno_id = ${alumnoId}::uuid
           AND e.sesion_id = (SELECT e2.sesion_id FROM evento_emocional e2 WHERE e2.alumno_id = ${alumnoId}::uuid ORDER BY e2.capturado_en DESC LIMIT 1)
         ORDER BY e.capturado_en LIMIT 500`;
    const [d] = await tx.$queryRaw<{ completadas: number; en_curso: number; pendientes: number; promedio: Prisma.Decimal | null; alertas: number; camara: boolean }[]>`
        SELECT count(*) FILTER (WHERE s.estado = 'completada')::int AS completadas,
               count(*) FILTER (WHERE s.estado = 'en_curso')::int AS en_curso,
               count(*) FILTER (WHERE s.estado = 'pendiente')::int AS pendientes,
               avg(s.resultado_final) FILTER (WHERE s.estado = 'completada') AS promedio,
               (SELECT count(*)::int FROM alerta al WHERE al.alumno_id = ${alumnoId}::uuid AND al.atendida_en IS NULL) AS alertas,
               EXISTS (SELECT 1 FROM consentimiento_tutor c WHERE c.alumno_id = ${alumnoId}::uuid AND c.aceptado_en IS NOT NULL
                        AND c.revocado_en IS NULL AND c.acepta_camara) AS camara
          FROM asignacion_alumno s WHERE s.alumno_id = ${alumnoId}::uuid`;
    const perfil = await tx.perfil_gamificacion.findUnique({ where: { alumno_id: alumnoId }, select: { puntos_totales: true, nivel_gamificacion: true } });
    const [racha] = await tx.$queryRaw<{ actual: number; mejor: number }[]>`SELECT racha_actual AS actual, mejor_racha AS mejor FROM fn_racha_vigente(${alumnoId}::uuid)`;
    return {
        datos: { id: a.id, nombre: a.nombre, apellidos: a.apellidos, avatar: a.avatar, grupoId: a.grupo.id, grupo: a.grupo.nombre, grado: a.grupo.grado, camara: d.camara },
        estadoEmocionalReciente: {
            estadoInicial: r?.estado ?? null,
            afectoPositivo: num(r?.ap),
            afectoNegativo: num(r?.an),
            fecha: r?.fecha ?? null,
            observaciones: r?.observaciones ?? [],
            serie: serie.map((s) => ({ capturadoEn: s.capturadoEn.toISOString(), estado: s.estado })),
        },
        ultimasNotas: await notas(tx, alumnoId, 3),
        resumenDesempeno: {
            completadas: d.completadas,
            enCurso: d.en_curso,
            pendientes: d.pendientes,
            promedioResultado: redondear(num(d.promedio), 1),
            puntos: perfil?.puntos_totales ?? 0,
            nivelGamificacion: perfil?.nivel_gamificacion ?? 1,
            racha: racha ?? { actual: 0, mejor: 0 },
            alertasPendientes: d.alertas,
        },
    };
}

export async function auditarVista(tx: Tx, docenteId: string, accion: "ver_alumno" | "exportar", recurso: string, recursoId: string, ip: string | null): Promise<void> {
    await tx.$executeRaw`SELECT fn_auditar(${docenteId}::uuid, 'docente'::rol_usuario, ${accion}::accion_auditoria, ${recurso}, ${recursoId}, ${ip}::inet)`;
}

// ───────────── Perfil estadístico (RF-19, EXP-07.3) ─────────────

export interface PerfilTema {
    temaId: string;
    tema: string;
    ejercicios: number;
    tiempoPromedioMs: number | null;
    intentosPromedio: number | null;
    porcentajeAciertos: number | null;
    erroresPorTipo: Record<string, number>;
    habilidadesMenorDominio: { habilidad: string; porcentajeAciertos: number; intentos: number }[];
}

export const MIN_INTENTOS_HABILIDAD = 5;

/** Etiqueta de la "habilidad": el subtema si el ejercicio lo tiene; si no, tipo de ejercicio y nivel. */
const habilidad = (subtema: string | null, tipo: string, nivel: number) => subtema ?? `${nombreTipo(tipo)} · nivel ${nivel}`;

export async function perfilEstadistico(tx: Tx, alumnoId: string, temaId?: string): Promise<PerfilTema[] | null> {
    if (!(await tx.alumno.findUnique({ where: { id: alumnoId }, select: { id: true } }))) return null;
    const filtroTema = temaId ? Prisma.sql`AND e.tema_id = ${temaId}::uuid` : Prisma.empty;
    // Por ejercicio presentado (actividad o práctica): tiempo total, intentos y si lo acertó
    const porTema = await tx.$queryRaw<{ tema_id: string; tema: string; orden: number; ejercicios: number; tiempo: number | null; intentos: number | null; aciertos: number }[]>`
        WITH ej AS (
          SELECT e.tema_id, i.ejercicio_id, coalesce(i.asignacion_id, i.practica_id) AS contexto,
                 sum(i.tiempo_ms) AS tiempo, max(i.numero_intento) AS intentos, bool_or(i.correcta) AS acerto
            FROM intento_ejercicio i JOIN ejercicio e ON e.id = i.ejercicio_id
           WHERE i.alumno_id = ${alumnoId}::uuid ${filtroTema}
           GROUP BY e.tema_id, i.ejercicio_id, coalesce(i.asignacion_id, i.practica_id))
        SELECT t.id AS tema_id, t.nombre AS tema, t.orden, count(*)::int AS ejercicios,
               avg(ej.tiempo)::float AS tiempo, avg(ej.intentos)::float AS intentos, count(*) FILTER (WHERE ej.acerto)::int AS aciertos
          FROM ej JOIN tema t ON t.id = ej.tema_id GROUP BY t.id ORDER BY t.orden, t.nombre`;
    const errores = await tx.$queryRaw<{ tema_id: string; tipo: string; n: number }[]>`
        SELECT e.tema_id, i.tipo_error::text AS tipo, count(*)::int AS n
          FROM intento_ejercicio i JOIN ejercicio e ON e.id = i.ejercicio_id
         WHERE i.alumno_id = ${alumnoId}::uuid AND NOT i.correcta AND i.tipo_error IS NOT NULL ${filtroTema}
         GROUP BY e.tema_id, i.tipo_error`;
    const habilidades = await tx.$queryRaw<{ tema_id: string; subtema: string | null; tipo: string; nivel: number; intentos: number; aciertos: number }[]>`
        SELECT e.tema_id, st.nombre AS subtema, e.tipo_interaccion::text AS tipo, e.nivel::int AS nivel,
               count(*)::int AS intentos, count(*) FILTER (WHERE i.correcta)::int AS aciertos
          FROM intento_ejercicio i JOIN ejercicio e ON e.id = i.ejercicio_id LEFT JOIN subtema st ON st.id = e.subtema_id
         WHERE i.alumno_id = ${alumnoId}::uuid ${filtroTema}
         GROUP BY e.tema_id, st.nombre, e.tipo_interaccion, e.nivel HAVING count(*) >= ${MIN_INTENTOS_HABILIDAD}`;
    return porTema.map((t) => ({
        temaId: t.tema_id,
        tema: t.tema,
        ejercicios: t.ejercicios,
        tiempoPromedioMs: t.tiempo === null ? null : Math.round(t.tiempo),
        intentosPromedio: redondear(t.intentos, 1),
        porcentajeAciertos: t.ejercicios ? Math.round((100 * t.aciertos) / t.ejercicios) : null,
        erroresPorTipo: Object.fromEntries(errores.filter((e) => e.tema_id === t.tema_id).map((e) => [e.tipo, e.n])),
        habilidadesMenorDominio: habilidades
            .filter((h) => h.tema_id === t.tema_id)
            .map((h) => ({ habilidad: habilidad(h.subtema, h.tipo, h.nivel), porcentajeAciertos: Math.round((100 * h.aciertos) / h.intentos), intentos: h.intentos }))
            .sort((a, b) => a.porcentajeAciertos - b.porcentajeAciertos || b.intentos - a.intentos)
            .slice(0, 3),
    }));
}

// ───────────── Notas rápidas (RF-50, EXP-07.5) ─────────────

export type Etiqueta = "conducta" | "emocional" | "academico" | "otro";

export interface Nota {
    id: string;
    fecha: string;
    texto: string;
    etiqueta: Etiqueta | null;
    /** true si la escribió el docente de la sesión: solo el autor la edita o la borra */
    propia: boolean;
}

const SELECT_NOTA = { id: true, fecha: true, texto: true, etiqueta: true, docente_id: true } as const;
type FilaNota = { id: string; fecha: Date; texto: string; etiqueta: string | null; docente_id: string };
const aNota = (n: FilaNota, usuarioId: string | null): Nota => ({
    id: n.id, fecha: n.fecha.toISOString(), texto: n.texto, etiqueta: n.etiqueta as Etiqueta | null, propia: n.docente_id === usuarioId,
});
/** Usuario de la sesión según el contexto de BD (el mismo que usa RLS). */
async function usuarioActual(tx: Tx): Promise<string | null> {
    const [u] = await tx.$queryRaw<{ id: string | null }[]>`SELECT app_user()::text AS id`;
    return u?.id ?? null;
}

export async function notas(tx: Tx, alumnoId: string, limite = 50): Promise<Nota[]> {
    const filas = await tx.nota_docente.findMany({ where: { alumno_id: alumnoId }, orderBy: { fecha: "desc" }, take: limite, select: SELECT_NOTA });
    const yo = await usuarioActual(tx);
    return filas.map((n) => aNota(n, yo));
}

/** Tres campos: fecha automática, texto 1–500 y etiqueta opcional. null si el alumno no es del docente. */
export async function crearNota(tx: Tx, docenteId: string, alumnoId: string, d: { texto: string; etiqueta?: Etiqueta | null }): Promise<Nota | null> {
    if (!(await tx.alumno.findUnique({ where: { id: alumnoId }, select: { id: true } }))) return null;
    const n = await tx.nota_docente.create({
        data: { docente_id: docenteId, alumno_id: alumnoId, texto: d.texto, etiqueta: d.etiqueta ?? null },
        select: SELECT_NOTA,
    });
    return aNota(n, docenteId);
}

/**
 * Cambia texto y etiqueta; la fecha original se conserva. Solo el autor: null si la nota no existe,
 * no es de ese alumno, la escribió otro docente o el alumno no es visible (RLS).
 */
export async function editarNota(tx: Tx, docenteId: string, alumnoId: string, notaId: string, d: { texto: string; etiqueta?: Etiqueta | null }): Promise<Nota | null> {
    const donde = { id: notaId, alumno_id: alumnoId, docente_id: docenteId };
    const r = await tx.nota_docente.updateMany({ where: donde, data: { texto: d.texto, etiqueta: d.etiqueta ?? null } });
    if (r.count === 0) return null;
    const n = await tx.nota_docente.findFirst({ where: donde, select: SELECT_NOTA });
    return n ? aNota(n, docenteId) : null;
}

/** Borra la nota. Mismas reglas que editarNota; false si no había nada que borrar. */
export async function borrarNota(tx: Tx, docenteId: string, alumnoId: string, notaId: string): Promise<boolean> {
    const r = await tx.nota_docente.deleteMany({ where: { id: notaId, alumno_id: alumnoId, docente_id: docenteId } });
    return r.count > 0;
}

// ───────────── Resultados académicos y consolidado (RF-35, EXP-07.4) ─────────────

export type TipoResultado = "tarea" | "trabajo_clase" | "interrogacion" | "actividad_numotion";
export const TIPOS_CAPTURABLES = ["tarea", "trabajo_clase", "interrogacion"] as const;

export interface Resultado {
    id: string;
    temaId: string;
    tema: string;
    tipo: TipoResultado;
    titulo: string;
    calificacion: number;
    fecha: string;
}

export interface ConsolidadoTema {
    temaId: string;
    tema: string;
    porTipo: Partial<Record<TipoResultado, number>>;
    promedio: number;
    registros: number;
}

export async function resultados(tx: Tx, alumnoId: string): Promise<{ items: Resultado[]; consolidado: ConsolidadoTema[] } | null> {
    if (!(await tx.alumno.findUnique({ where: { id: alumnoId }, select: { id: true } }))) return null;
    const filas = await tx.$queryRaw<{ id: string; tema_id: string; tema: string; tipo: TipoResultado; titulo: string; calificacion: Prisma.Decimal; fecha: string }[]>`
        SELECT r.id, r.tema_id, t.nombre AS tema, r.tipo::text AS tipo, r.titulo, r.calificacion, to_char(r.fecha, 'YYYY-MM-DD') AS fecha
          FROM resultado_academico r JOIN tema t ON t.id = r.tema_id
         WHERE r.alumno_id = ${alumnoId}::uuid ORDER BY r.fecha DESC, r.creado_en DESC`;
    const items = filas.map((f) => ({ id: f.id, temaId: f.tema_id, tema: f.tema, tipo: f.tipo, titulo: f.titulo, calificacion: num(f.calificacion) ?? 0, fecha: f.fecha }));
    return { items, consolidado: consolidar(items) };
}

/** Promedio por tipo y general por tema; el general es el promedio de los tipos (cada fuente pesa igual). */
export function consolidar(items: readonly Pick<Resultado, "temaId" | "tema" | "tipo" | "calificacion">[]): ConsolidadoTema[] {
    const porTema = new Map<string, { tema: string; tipos: Map<TipoResultado, number[]> }>();
    for (const r of items) {
        const t = porTema.get(r.temaId) ?? { tema: r.tema, tipos: new Map() };
        t.tipos.set(r.tipo, [...(t.tipos.get(r.tipo) ?? []), r.calificacion]);
        porTema.set(r.temaId, t);
    }
    return [...porTema.entries()].map(([temaId, t]) => {
        const porTipo: Partial<Record<TipoResultado, number>> = {};
        for (const [tipo, v] of t.tipos) porTipo[tipo] = redondear(promedio(v), 1) ?? 0;
        const valores = Object.values(porTipo) as number[];
        return { temaId, tema: t.tema, porTipo, promedio: redondear(promedio(valores), 1) ?? 0, registros: [...t.tipos.values()].reduce((s, v) => s + v.length, 0) };
    });
}

export async function capturarResultado(
    tx: Tx,
    docenteId: string,
    alumnoId: string,
    d: { temaId: string; tipo: (typeof TIPOS_CAPTURABLES)[number]; titulo: string; calificacion: number; fecha: string },
): Promise<Resultado | null> {
    if (!(await tx.alumno.findUnique({ where: { id: alumnoId }, select: { id: true } }))) return null;
    const tema = await tx.tema.findUnique({ where: { id: d.temaId }, select: { nombre: true } });
    if (!tema) return null;
    const [r] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO resultado_academico (alumno_id, tema_id, tipo, titulo, calificacion, fecha, capturado_por)
        VALUES (${alumnoId}::uuid, ${d.temaId}::uuid, ${d.tipo}::tipo_resultado, ${d.titulo}, ${d.calificacion}, ${d.fecha}::text::date, ${docenteId}::uuid)
        RETURNING id`;
    return { id: r.id, temaId: d.temaId, tema: tema.nombre, tipo: d.tipo, titulo: d.titulo, calificacion: d.calificacion, fecha: d.fecha };
}

// ───────────── Cruce académico-emocional (RF-52, EXP-07.4) ─────────────
// Relaciona, por tema, el resultado del diagnóstico de matemáticas con el PANAS-C de la MISMA
// sesión. Solo entran las sesiones en las que el alumno tiene ambos resultados.

export interface SesionCruce {
    fecha: string;
    nivelDominio: number;
    porcentajeAciertos: number;
    afectoPositivo: number;
    afectoNegativo: number;
}

export interface CruceTema {
    temaId: string;
    tema: string;
    /** Sesión más reciente con diagnóstico del tema y PANAS-C */
    ultima: SesionCruce;
    /** Promedios de todas las sesiones con ambos resultados */
    sesiones: number;
    dominioPromedio: number;
    afectoPositivoProm: number;
    afectoNegativoProm: number;
    /** Últimas sesiones, la más reciente primero (máx. 5) */
    historial: SesionCruce[];
    /** Dominio ≤ 2 con AN ≥ 3 en la última sesión: la dificultad del tema coincide con afecto negativo alto */
    coincidencia: boolean;
}

export const UMBRAL_DOMINIO_BAJO = 2;
export const UMBRAL_AN_ALTO = 3;
const HISTORIAL_CRUCE = 5;

export async function cruce(tx: Tx, alumnoId: string): Promise<CruceTema[] | null> {
    if (!(await tx.alumno.findUnique({ where: { id: alumnoId }, select: { id: true } }))) return null;
    const filas = await tx.$queryRaw<{
        tema_id: string; tema: string; fecha: string; nivel: number; aciertos: number; total: number; ap: Prisma.Decimal; an: Prisma.Decimal;
    }[]>`
        SELECT d.tema_id, t.nombre AS tema, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, d.nivel_dominio::int AS nivel,
               d.aciertos::int AS aciertos, d.total::int AS total, p.afecto_positivo AS ap, p.afecto_negativo AS an
          FROM diagnostico_mat_resultado d
          JOIN sesion_alumno s ON s.id = d.sesion_id
          JOIN panas_resultado p ON p.sesion_id = d.sesion_id AND p.completado_en IS NOT NULL
                                AND p.afecto_positivo IS NOT NULL AND p.afecto_negativo IS NOT NULL
          JOIN tema t ON t.id = d.tema_id
         WHERE d.alumno_id = ${alumnoId}::uuid
         ORDER BY t.orden, t.nombre, s.fecha DESC, d.creado_en DESC`;
    const porTema = new Map<string, { tema: string; sesiones: SesionCruce[] }>();
    for (const f of filas) {
        const grupo = porTema.get(f.tema_id) ?? { tema: f.tema, sesiones: [] };
        grupo.sesiones.push({
            fecha: f.fecha,
            nivelDominio: f.nivel,
            porcentajeAciertos: Math.round((100 * f.aciertos) / f.total),
            afectoPositivo: num(f.ap) ?? 0,
            afectoNegativo: num(f.an) ?? 0,
        });
        porTema.set(f.tema_id, grupo);
    }
    return [...porTema.entries()].map(([temaId, { tema, sesiones }]) => {
        const ultima = sesiones[0];
        return {
            temaId,
            tema,
            ultima,
            sesiones: sesiones.length,
            dominioPromedio: redondear(promedio(sesiones.map((x) => x.nivelDominio)), 1) ?? 0,
            afectoPositivoProm: redondear(promedio(sesiones.map((x) => x.afectoPositivo))) ?? 0,
            afectoNegativoProm: redondear(promedio(sesiones.map((x) => x.afectoNegativo))) ?? 0,
            historial: sesiones.slice(0, HISTORIAL_CRUCE),
            coincidencia: ultima.nivelDominio <= UMBRAL_DOMINIO_BAJO && ultima.afectoNegativo >= UMBRAL_AN_ALTO,
        };
    });
}

/** Serie temporal de estados derivados (sin imágenes) para la ficha. */
export async function serieEmocional(tx: Tx, alumnoId: string, desde?: string, hasta?: string): Promise<{ capturadoEn: string; estado: string; asignacionId: string | null }[] | null> {
    if (!(await tx.alumno.findUnique({ where: { id: alumnoId }, select: { id: true } }))) return null;
    const filas = await tx.$queryRaw<{ capturadoEn: Date; estado: string; asignacionId: string | null }[]>`
        SELECT capturado_en AS "capturadoEn", estado_derivado::text AS estado, asignacion_id AS "asignacionId" FROM evento_emocional
         WHERE alumno_id = ${alumnoId}::uuid
           ${desde ? Prisma.sql`AND (capturado_en AT TIME ZONE 'America/Tijuana')::date >= ${desde}::text::date` : Prisma.empty}
           ${hasta ? Prisma.sql`AND (capturado_en AT TIME ZONE 'America/Tijuana')::date <= ${hasta}::text::date` : Prisma.empty}
         ORDER BY capturado_en DESC LIMIT 1000`;
    return filas.map((f) => ({ capturadoEn: f.capturadoEn.toISOString(), estado: f.estado, asignacionId: f.asignacionId }));
}

// ───────────── Reporte grupal por tema (RF-18, EXP-07.6) ─────────────

export interface FilaReporte {
    temaId: string;
    tema: string;
    subtema: string;
    /** Ejercicios distintos que se resolvieron (cada alumno cuenta aparte). */
    ejercicios: number;
    /** De esos ejercicios, los que se terminaron respondiendo bien. */
    aciertos: number;
    /** Intentos incorrectos. */
    errores: number;
    intentos: number;
    indiceError: number;
    alumnosAfectados: number;
}

export interface FiltrosReporte {
    desde?: string;
    hasta?: string;
    alumnoId?: string;
}

export async function reporteTemas(tx: Tx, grupoId: string, f: FiltrosReporte): Promise<FilaReporte[] | null> {
    if (!(await tx.grupo.findUnique({ where: { id: grupoId }, select: { id: true } }))) return null;
    const rango = (col: Prisma.Sql) => Prisma.sql`
        ${f.desde ? Prisma.sql`AND (${col} AT TIME ZONE 'America/Tijuana')::date >= ${f.desde}::text::date` : Prisma.empty}
        ${f.hasta ? Prisma.sql`AND (${col} AT TIME ZONE 'America/Tijuana')::date <= ${f.hasta}::text::date` : Prisma.empty}`;
    const alumno = f.alumnoId ? Prisma.sql`AND i.alumno_id = ${f.alumnoId}::uuid` : Prisma.empty;
    const intentos = await tx.$queryRaw<{ tema_id: string; tema: string; subtema: string | null; tipo: string; nivel: number; ejercicios: number; aciertos: number; intentos: number; errores: number; afectados: number }[]>`
        SELECT e.tema_id, t.nombre AS tema, st.nombre AS subtema, e.tipo_interaccion::text AS tipo, e.nivel::int AS nivel,
               count(DISTINCT (i.alumno_id, i.ejercicio_id))::int AS ejercicios,
               count(DISTINCT (i.alumno_id, i.ejercicio_id)) FILTER (WHERE i.correcta)::int AS aciertos,
               count(*)::int AS intentos, count(*) FILTER (WHERE NOT i.correcta)::int AS errores,
               count(DISTINCT i.alumno_id) FILTER (WHERE NOT i.correcta)::int AS afectados
          FROM intento_ejercicio i JOIN alumno a ON a.id = i.alumno_id
          JOIN ejercicio e ON e.id = i.ejercicio_id JOIN tema t ON t.id = e.tema_id LEFT JOIN subtema st ON st.id = e.subtema_id
         WHERE a.grupo_id = ${grupoId}::uuid ${alumno} ${rango(Prisma.sql`i.creado_en`)}
         GROUP BY e.tema_id, t.nombre, st.nombre, e.tipo_interaccion, e.nivel`;
    // RF-18: temas/subtemas ordenados por índice de error (intentos incorrectos / intentos)
    const filas = intentos.map((x) => {
        return {
            temaId: x.tema_id,
            tema: x.tema,
            subtema: habilidad(x.subtema, x.tipo, x.nivel),
            ejercicios: x.ejercicios,
            aciertos: x.aciertos,
            errores: x.errores,
            intentos: x.intentos,
            indiceError: redondear(x.errores / x.intentos) ?? 0,
            alumnosAfectados: x.afectados,
        };
    });
    return filas.sort((a, b) => b.indiceError - a.indiceError);
}
