// Gamificación del alumno (EXP-06: RF-03, RF-22, RF-63, RF-65, RF-66, RF-67, RF-68).
// Panel, perfil, insignias, puntos y práctica libre. Todo en contexto del alumno (RLS); la racha la
// escribe el trigger trg_practica_racha y se lee siempre con fn_racha_vigente. Nunca se exponen
// datos emocionales ni de otros alumnos (EXP-06.4).
import { semillaDeTexto, crearRng } from "@numotion/core/dominio/aleatorio";
import { nombreTipo, tiposDeTema, TIPOS_INTERACCION, type TipoInteraccionActividad } from "@numotion/core/dominio/catalogo";
import { clasificarError, esCorrecta, generarParaActividad, respuestaLegible } from "@numotion/core/dominio/contenido";
import { aciertosTrasAyuda, evaluarInsignias, type InsigniaCatalogo } from "@numotion/core/dominio/insignias";
import { elegirMensaje, type HistorialAcademico, type MensajeCatalogo } from "@numotion/core/dominio/mensajes";
import { personajeDe, progresoNivel, semanaHabil, type Personaje, type ProgresoNivel } from "@numotion/core/dominio/personaje";
import { nivelGamificacion, puntosAciertoPractica } from "@numotion/core/dominio/puntos";
import { errorBd, num, Prisma, type Tx } from "../../infra/db";
import { aEjercicio, aPublico, cargarEjercicio, insertarEjercicio, json, MAX_INTENTOS, type EjercicioPublico } from "./ejercicio";

export const EJERCICIOS_POR_PRACTICA = 5;
/** En la práctica libre el ejercicio se cierra al acertar o al 3.er intento (se muestra la solución) */
export const MAX_INTENTOS_PRACTICA = 3;

const hoyLocal = async (tx: Tx) => (await tx.$queryRaw<{ hoy: string }[]>`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`)[0].hoy;

// ───────────── Puntos y nivel ─────────────

/** Suma puntos al perfil y recalcula el nivel. `subioA` = nuevo nivel si subió. Sin perfil, no hace nada. */
export async function sumarPuntos(tx: Tx, alumnoId: string, puntos: number): Promise<{ subioA: number | null }> {
    if (puntos <= 0) return { subioA: null };
    const filas = await tx.$queryRaw<{ puntos: number; nivel: number }[]>`
        UPDATE perfil_gamificacion SET puntos_totales = puntos_totales + ${puntos}
         WHERE alumno_id = ${alumnoId}::uuid RETURNING puntos_totales AS puntos, nivel_gamificacion::int AS nivel`;
    const p = filas[0];
    if (!p) return { subioA: null };
    const nivel = nivelGamificacion(p.puntos);
    if (nivel === p.nivel) return { subioA: null };
    await tx.perfil_gamificacion.update({ where: { alumno_id: alumnoId }, data: { nivel_gamificacion: nivel }, select: { alumno_id: true } });
    return { subioA: nivel > p.nivel ? nivel : null };
}

// ───────────── Insignias ─────────────

export interface InsigniaObtenida {
    clave: string;
    nombre: string;
    descripcion: string;
    icono: string;
    obtenidaEn: string | null;
}

async function racha(tx: Tx, alumnoId: string): Promise<{ actual: number; mejor: number }> {
    const [r] = await tx.$queryRaw<{ actual: number; mejor: number }[]>`
        SELECT racha_actual AS actual, mejor_racha AS mejor FROM fn_racha_vigente(${alumnoId}::uuid)`;
    return r ?? { actual: 0, mejor: 0 };
}

/** Evalúa el catálogo con el contexto actual y otorga las nuevas (ON CONFLICT DO NOTHING). */
export async function otorgarInsignias(tx: Tx, alumnoId: string): Promise<InsigniaObtenida[]> {
    const catalogo = await tx.insignia.findMany({ select: { id: true, clave: true, nombre: true, descripcion: true, icono: true, regla: true } });
    const obtenidas = await tx.alumno_insignia.findMany({ where: { alumno_id: alumnoId }, select: { insignia: { select: { clave: true } } } });
    const ya = new Set(obtenidas.map((o) => o.insignia.clave));
    if (catalogo.every((i) => ya.has(i.clave))) return [];

    const [conteos] = await tx.$queryRaw<{ asignaciones: number; practicas: number; tipos: number }[]>`
        SELECT (SELECT count(*)::int FROM asignacion_alumno WHERE alumno_id = ${alumnoId}::uuid AND estado = 'completada') AS asignaciones,
               (SELECT count(*)::int FROM practica_libre WHERE alumno_id = ${alumnoId}::uuid AND completada_en IS NOT NULL) AS practicas,
               (SELECT count(DISTINCT juego)::int FROM practica_libre WHERE alumno_id = ${alumnoId}::uuid AND completada_en IS NOT NULL) AS tipos`;
    // Ejercicios cerrados de actividades, en orden cronológico (los últimos 200 bastan para la regla)
    const ejercicios = await tx.$queryRaw<{ ayuda: boolean; correcto: boolean }[]>`
        SELECT * FROM (
          SELECT bool_or(ayuda_solicitada) AS ayuda, bool_or(correcta) AS correcto, max(creado_en) AS fin
            FROM intento_ejercicio WHERE alumno_id = ${alumnoId}::uuid AND asignacion_id IS NOT NULL
           GROUP BY asignacion_id, ejercicio_id HAVING bool_or(correcta) OR max(numero_intento) >= ${MAX_INTENTOS}
           ORDER BY fin DESC LIMIT 200) u ORDER BY fin`;
    const resultados = await tx.$queryRaw<{ clave: string; resultado: unknown }[]>`
        SELECT t.clave, s.resultado_final AS resultado
          FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id JOIN tema t ON t.id = ac.tema_id
         WHERE s.alumno_id = ${alumnoId}::uuid AND s.estado = 'completada' AND s.resultado_final IS NOT NULL`;
    const resultadosPorTema: Record<string, number[]> = {};
    for (const r of resultados) (resultadosPorTema[r.clave] ??= []).push(num(r.resultado as number) ?? 0);

    const nuevas = evaluarInsignias(
        {
            asignacionesCompletadas: conteos.asignaciones,
            rachaActual: (await racha(tx, alumnoId)).actual,
            practicasCompletadas: conteos.practicas,
            tiposJuegoDistintos: conteos.tipos,
            aciertosTrasAyuda: aciertosTrasAyuda(ejercicios),
            resultadosPorTema,
        },
        catalogo.map((i) => ({ clave: i.clave, regla: i.regla as unknown as InsigniaCatalogo["regla"] })),
        ya,
    );
    const otorgadas: InsigniaObtenida[] = [];
    for (const clave of nuevas) {
        const i = catalogo.find((c) => c.clave === clave)!;
        const filas = await tx.$queryRaw<{ obtenida_en: Date }[]>`
            INSERT INTO alumno_insignia (alumno_id, insignia_id) VALUES (${alumnoId}::uuid, ${i.id}::uuid)
            ON CONFLICT (alumno_id, insignia_id) DO NOTHING RETURNING obtenida_en`;
        if (filas[0]) otorgadas.push({ clave, nombre: i.nombre, descripcion: i.descripcion, icono: i.icono, obtenidaEn: filas[0].obtenida_en.toISOString() });
    }
    return otorgadas;
}

async function insigniasDe(tx: Tx, alumnoId: string): Promise<{ obtenidas: InsigniaObtenida[]; pendientes: Omit<InsigniaObtenida, "obtenidaEn">[] }> {
    const catalogo = await tx.insignia.findMany({ select: { id: true, clave: true, nombre: true, descripcion: true, icono: true }, orderBy: { clave: "asc" } });
    const mias = await tx.alumno_insignia.findMany({ where: { alumno_id: alumnoId }, select: { insignia_id: true, obtenida_en: true }, orderBy: { obtenida_en: "asc" } });
    const porId = new Map(mias.map((m) => [m.insignia_id, m.obtenida_en]));
    const ver = (i: (typeof catalogo)[number]) => ({ clave: i.clave, nombre: i.nombre, descripcion: i.descripcion, icono: i.icono });
    return {
        obtenidas: mias.map((m) => {
            const i = catalogo.find((c) => c.id === m.insignia_id)!;
            return { ...ver(i), obtenidaEn: m.obtenida_en.toISOString() };
        }),
        pendientes: catalogo.filter((i) => !porId.has(i.id)).map(ver),
    };
}

// ───────────── Perfil y panel (RF-63, RF-65, RF-66, RF-22) ─────────────

export interface Gamificacion extends ProgresoNivel {
    personaje: Personaje;
}

async function gamificacion(tx: Tx, alumnoId: string, avatar: string): Promise<Gamificacion> {
    const p = await tx.perfil_gamificacion.findUnique({ where: { alumno_id: alumnoId }, select: { puntos_totales: true, nivel_gamificacion: true } });
    const puntos = p?.puntos_totales ?? 0;
    const nivel = p?.nivel_gamificacion ?? 1;
    return { ...progresoNivel(puntos, nivel), personaje: personajeDe(avatar, nivel) };
}

export interface Perfil {
    nombre: string;
    grado: number;
    grupo: string;
    gamificacion: Gamificacion;
    insignias: InsigniaObtenida[];
    insigniasPorGanar: Omit<InsigniaObtenida, "obtenidaEn">[];
    racha: { actual: number; mejor: number };
}

/** Perfil del alumno (EXP-06.4): sin datos emocionales ni comparaciones. */
export async function perfil(tx: Tx, alumnoId: string): Promise<Perfil> {
    const a = await tx.alumno.findUniqueOrThrow({ where: { id: alumnoId }, select: { nombre: true, avatar: true, grupo: { select: { nombre: true, grado: true } } } });
    const ins = await insigniasDe(tx, alumnoId);
    return {
        nombre: a.nombre,
        grado: a.grupo.grado,
        grupo: a.grupo.nombre,
        gamificacion: await gamificacion(tx, alumnoId, a.avatar),
        insignias: ins.obtenidas,
        insigniasPorGanar: ins.pendientes,
        racha: await racha(tx, alumnoId),
    };
}

export interface DiaSemana {
    fecha: string;
    dia: "L" | "M" | "Mi" | "J" | "V";
    hecho: boolean;
    esHoy: boolean;
    futuro: boolean;
}

export interface Panel {
    nombre: string;
    mensajeMotivacional: string | null;
    racha: { actual: number; mejor: number; semana: DiaSemana[] };
    gamificacion: Gamificacion;
    insignias: InsigniaObtenida[];
    actividades: { pendientes: number; enCurso: number };
}

const DIAS: DiaSemana["dia"][] = ["L", "M", "Mi", "J", "V"];

/** Historial académico para el mensaje motivacional (RF-22): actividades y diagnóstico más reciente. */
export async function historialAcademico(tx: Tx, alumnoId: string): Promise<HistorialAcademico> {
    const [act] = await tx.$queryRaw<{ completadas: number; resultado: Prisma.Decimal | null; tema: string | null }[]>`
        SELECT (SELECT count(*)::int FROM asignacion_alumno WHERE alumno_id = ${alumnoId}::uuid AND estado = 'completada') AS completadas,
               u.resultado, u.tema
          FROM (SELECT 1) x
          LEFT JOIN LATERAL (
            SELECT s.resultado_final AS resultado, t.nombre AS tema
              FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id JOIN tema t ON t.id = ac.tema_id
             WHERE s.alumno_id = ${alumnoId}::uuid AND s.estado = 'completada' AND s.resultado_final IS NOT NULL
             ORDER BY s.completada_en DESC LIMIT 1) u ON true`;
    const dominio = await tx.$queryRaw<{ tema: string; nivel: number }[]>`
        SELECT DISTINCT ON (d.tema_id) t.nombre AS tema, d.nivel_dominio::int AS nivel, t.orden
          FROM diagnostico_mat_resultado d JOIN tema t ON t.id = d.tema_id
         WHERE d.alumno_id = ${alumnoId}::uuid
         ORDER BY d.tema_id, d.creado_en DESC`;
    const fuerte = dominio.filter((d) => d.nivel >= 4).sort((x, y) => y.nivel - x.nivel)[0];
    const reto = dominio.filter((d) => d.nivel <= 2).sort((x, y) => x.nivel - y.nivel)[0];
    return {
        actividadesCompletadas: act.completadas,
        ultimoResultado: num(act.resultado),
        ultimoTema: act.tema,
        temaFuerte: fuerte?.tema ?? null,
        temaReto: reto?.tema ?? null,
    };
}

export async function panel(tx: Tx, alumnoId: string): Promise<Panel> {
    const hoy = await hoyLocal(tx);
    const a = await tx.alumno.findUniqueOrThrow({ where: { id: alumnoId }, select: { nombre: true, avatar: true } });
    const r = await racha(tx, alumnoId);
    const semana = semanaHabil(hoy);
    const hechos = await tx.$queryRaw<{ dia: string }[]>`
        SELECT DISTINCT to_char((completada_en AT TIME ZONE 'America/Tijuana')::date, 'YYYY-MM-DD') AS dia
          FROM practica_libre
         WHERE alumno_id = ${alumnoId}::uuid AND completada_en IS NOT NULL
           AND (completada_en AT TIME ZONE 'America/Tijuana')::date BETWEEN ${semana[0]}::text::date AND ${semana[4]}::text::date`;
    const dias = new Set(hechos.map((h) => h.dia));

    // Mensaje del día (RF-22): identidad, historial académico, estado inicial de hoy (uso interno,
    // nunca se muestra) y racha
    const [retro] = await tx.$queryRaw<{ estado: string }[]>`
        SELECT r.estado_inicial::text AS estado FROM retroalimentacion r JOIN sesion_alumno s ON s.id = r.sesion_id
         WHERE r.alumno_id = ${alumnoId}::uuid AND s.fecha = fn_hoy_local() LIMIT 1`;
    const catalogo = (await tx.mensaje_motivacional.findMany({ select: { id: true, texto: true, condicion: true } })) as unknown as MensajeCatalogo[];
    const previo = await tx.perfil_gamificacion.findUnique({ where: { alumno_id: alumnoId }, select: { ultimo_mensaje_id: true, ultimo_mensaje_fecha: true } });
    const mensaje = elegirMensaje(
        catalogo,
        { nombre: a.nombre, racha: r.actual, estadoInicial: retro?.estado ?? null, fecha: hoy, historial: await historialAcademico(tx, alumnoId) },
        previo?.ultimo_mensaje_id && previo.ultimo_mensaje_fecha ? { id: previo.ultimo_mensaje_id, fecha: previo.ultimo_mensaje_fecha.toISOString().slice(0, 10) } : null,
    );
    if (mensaje && previo && previo.ultimo_mensaje_id !== mensaje.id) {
        await tx.perfil_gamificacion.update({ where: { alumno_id: alumnoId }, data: { ultimo_mensaje_id: mensaje.id, ultimo_mensaje_fecha: new Date(`${hoy}T00:00:00Z`) }, select: { alumno_id: true } });
    }

    const [act] = await tx.$queryRaw<{ pendientes: number; en_curso: number }[]>`
        SELECT count(*) FILTER (WHERE s.estado = 'pendiente')::int AS pendientes, count(*) FILTER (WHERE s.estado = 'en_curso')::int AS en_curso
          FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id
         WHERE s.alumno_id = ${alumnoId}::uuid AND ac.fecha_asignacion <= fn_hoy_local()`;

    return {
        nombre: a.nombre,
        mensajeMotivacional: mensaje?.texto ?? null,
        racha: { ...r, semana: semana.map((fecha, i) => ({ fecha, dia: DIAS[i], hecho: dias.has(fecha), esHoy: fecha === hoy, futuro: fecha > hoy })) },
        gamificacion: await gamificacion(tx, alumnoId, a.avatar),
        insignias: (await insigniasDe(tx, alumnoId)).obtenidas,
        actividades: { pendientes: act.pendientes, enCurso: act.en_curso },
    };
}

// ───────────── Práctica libre (EXP-06.6) ─────────────

export interface Juego {
    tipo: TipoInteraccionActividad;
    temaId: string;
    temaClave: string;
    tema: string;
    nombre: string;
    icono: string;
    /** RF-03: el último diagnóstico del tema muestra dominio insuficiente (≤ 2): se muestra primero */
    recomendado: boolean;
}

/** Nivel de dominio (1–5) a partir del cual ya no se recomienda practicar el tema. */
export const DOMINIO_INSUFICIENTE_MAX = 2;

/**
 * Juegos disponibles: cada tipo de cada tema del grado del alumno. Todos se pueden jugar; los temas
 * con dominio insuficiente en el diagnóstico más reciente van primero (el más bajo antes) y se marcan
 * como recomendados (RF-03).
 */
export async function juegosDisponibles(tx: Tx, alumnoId: string): Promise<Juego[]> {
    const temas = await tx.$queryRaw<{ id: string; clave: string; nombre: string; dominio: number | null }[]>`
        SELECT t.id, t.clave, t.nombre,
               (SELECT d.nivel_dominio::int FROM diagnostico_mat_resultado d
                 WHERE d.alumno_id = a.id AND d.tema_id = t.id ORDER BY d.creado_en DESC LIMIT 1) AS dominio
          FROM tema t JOIN grupo g ON g.grado BETWEEN t.grado_min AND t.grado_max
          JOIN alumno a ON a.grupo_id = g.id WHERE a.id = ${alumnoId}::uuid ORDER BY t.orden, t.nombre`;
    const recomendado = (d: number | null) => d !== null && d <= DOMINIO_INSUFICIENTE_MAX;
    // sort es estable: fuera de los recomendados se conserva el orden del catálogo
    const ordenados = [...temas].sort((x, y) =>
        recomendado(x.dominio) && recomendado(y.dominio) ? x.dominio! - y.dominio! : Number(recomendado(y.dominio)) - Number(recomendado(x.dominio)));
    return ordenados.flatMap((t) =>
        tiposDeTema(t.clave).map((tipo) => ({
            tipo,
            temaId: t.id,
            temaClave: t.clave,
            tema: t.nombre,
            nombre: nombreTipo(tipo),
            icono: TIPOS_INTERACCION.find((x) => x.id === tipo)?.icono ?? "🎮",
            recomendado: recomendado(t.dominio),
        })),
    );
}

export interface PracticaIniciada {
    practicaId: string;
    nivel: number;
    tema: string;
    juego: string;
    ejercicios: EjercicioPublico[];
}

/** Último nivel_actual del alumno en el tema (o 2 si nunca tuvo una actividad del tema). */
async function nivelEnTema(tx: Tx, alumnoId: string, temaId: string): Promise<number> {
    const [f] = await tx.$queryRaw<{ nivel: number }[]>`
        SELECT s.nivel_actual::int AS nivel FROM asignacion_alumno s JOIN actividad ac ON ac.id = s.actividad_id
         WHERE s.alumno_id = ${alumnoId}::uuid AND ac.tema_id = ${temaId}::uuid
         ORDER BY coalesce(s.completada_en, s.iniciada_en, s.creado_en) DESC LIMIT 1`;
    return f?.nivel ?? 2;
}

export async function iniciarPractica(tx: Tx, alumnoId: string, tipo: TipoInteraccionActividad, temaId: string): Promise<PracticaIniciada | { error: "no_disponible" }> {
    const juego = (await juegosDisponibles(tx, alumnoId)).find((j) => j.tipo === tipo && j.temaId === temaId);
    if (!juego) return { error: "no_disponible" };
    const nivel = await nivelEnTema(tx, alumnoId, temaId);
    const p = await tx.practica_libre.create({ data: { alumno_id: alumnoId, juego: tipo, tema_id: temaId, nivel }, select: { id: true } });
    const ejercicios: EjercicioPublico[] = [];
    for (let i = 0; i < EJERCICIOS_POR_PRACTICA; i++) {
        const e = generarParaActividad(juego.temaClave, tipo, nivel, crearRng(semillaDeTexto(`practica|${p.id}|${i}`)));
        if (!e) return { error: "no_disponible" };
        ejercicios.push(aPublico(await insertarEjercicio(tx, { temaId, tipo, nivel }, e, "generador")));
    }
    await tx.practica_libre.update({ where: { id: p.id }, data: { ejercicios: ejercicios.map((e) => e.id) }, select: { id: true } });
    return { practicaId: p.id, nivel, tema: juego.tema, juego: juego.nombre, ejercicios };
}

export interface DatosIntentoPractica {
    clienteId: string;
    ejercicioId: string;
    respuesta: string;
    tiempoMs: number;
}

export interface ResultadoIntentoPractica {
    correcta: boolean;
    ejercicioCerrado: boolean;
    intentosRestantes: number;
    /** Al cerrarse sin acierto se muestra cómo se resolvía (RF-45) */
    solucion: { pasos: { orden: number; texto: string }[]; respuestaCorrecta: string } | null;
    progreso: { resueltos: number; total: number };
    /** RF-03: puntos ganados con esta respuesta (0 si fue incorrecta) */
    puntos: number;
    /** Nuevo nivel de gamificación si estos puntos lo subieron */
    subioNivel: number | null;
}

export type FalloPractica = { error: "no_encontrada" | "completada" | "ejercicio_no_vigente" | "cliente_repetido" | "incompleta" };

async function cargarPractica(tx: Tx, alumnoId: string, id: string) {
    const filas = await tx.$queryRaw<{ id: string; ejercicios: string[]; completada_en: Date | null; puntos: number; juego: string }[]>`
        SELECT id, ejercicios, completada_en, puntos, juego::text FROM practica_libre WHERE id = ${id}::uuid AND alumno_id = ${alumnoId}::uuid FOR UPDATE`;
    return filas[0] ?? null;
}

/** Ejercicios cerrados de la práctica (acertados o con el máximo de intentos). */
async function cerradosDe(tx: Tx, practicaId: string): Promise<Set<string>> {
    const filas = await tx.$queryRaw<{ ejercicio_id: string }[]>`
        SELECT ejercicio_id FROM intento_ejercicio WHERE practica_id = ${practicaId}::uuid
         GROUP BY ejercicio_id HAVING bool_or(correcta) OR max(numero_intento) >= ${MAX_INTENTOS_PRACTICA}`;
    return new Set(filas.map((f) => f.ejercicio_id));
}

export async function intentoPractica(tx: Tx, alumnoId: string, practicaId: string, d: DatosIntentoPractica): Promise<ResultadoIntentoPractica | FalloPractica> {
    const previo = await tx.intento_ejercicio.findUnique({ where: { cliente_id: d.clienteId }, select: { resultado: true } });
    if (previo?.resultado) return previo.resultado as unknown as ResultadoIntentoPractica;
    const p = await cargarPractica(tx, alumnoId, practicaId);
    if (!p) return { error: "no_encontrada" };
    if (p.completada_en) return { error: "completada" };
    const cerrados = await cerradosDe(tx, p.id);
    if (!p.ejercicios.includes(d.ejercicioId) || cerrados.has(d.ejercicioId)) return { error: "ejercicio_no_vigente" };

    const numeroIntento = (await tx.intento_ejercicio.count({ where: { practica_id: p.id, ejercicio_id: d.ejercicioId } })) + 1;
    const fila = await cargarEjercicio(tx, d.ejercicioId);
    const ejercicio = aEjercicio(fila);
    const correcta = esCorrecta(ejercicio, d.respuesta);
    const cerrado = correcta || numeroIntento >= MAX_INTENTOS_PRACTICA;
    const solucion = cerrado && !correcta ? { pasos: fila.pasos_solucion, respuestaCorrecta: respuestaLegible(ejercicio) } : null;
    let id: string;
    await tx.$executeRaw`SAVEPOINT intento_practica`;
    try {
        ({ id } = await tx.intento_ejercicio.create({
            data: {
                practica_id: p.id,
                alumno_id: alumnoId,
                ejercicio_id: d.ejercicioId,
                nivel: fila.nivel,
                respuesta: json({ valor: d.respuesta.slice(0, 600) }),
                correcta,
                tipo_error: correcta ? null : clasificarError(ejercicio, d.respuesta),
                numero_intento: numeroIntento,
                tiempo_ms: Math.round(Math.min(d.tiempoMs, 30 * 60_000)),
                guia_mostrada: solucion ? "final" : "ninguna",
                cliente_id: d.clienteId,
            },
            select: { id: true },
        }));
        await tx.$executeRaw`RELEASE SAVEPOINT intento_practica`;
    } catch (e) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT intento_practica`;
        if (errorBd(e)?.codigo === "23505") return { error: "cliente_repetido" };
        throw e;
    }

    // RF-03: los puntos se acreditan con cada respuesta correcta
    const puntos = puntosAciertoPractica(correcta, numeroIntento);
    let subioNivel: number | null = null;
    if (puntos > 0) {
        await tx.practica_libre.update({ where: { id: p.id }, data: { puntos: { increment: puntos } }, select: { id: true } });
        subioNivel = (await sumarPuntos(tx, alumnoId, puntos)).subioA;
    }
    const resultado: ResultadoIntentoPractica = {
        correcta,
        ejercicioCerrado: cerrado,
        intentosRestantes: cerrado ? 0 : MAX_INTENTOS_PRACTICA - numeroIntento,
        solucion,
        progreso: { resueltos: cerrados.size + (cerrado ? 1 : 0), total: p.ejercicios.length },
        puntos,
        subioNivel,
    };
    // Idempotencia: el mismo clienteId devuelve esta respuesta
    await tx.intento_ejercicio.update({ where: { id }, data: { resultado: json(resultado) }, select: { id: true } });
    return resultado;
}

export interface PracticaCompletada {
    /** Puntos ganados en el juego: la suma de los de cada respuesta correcta (RF-03) */
    puntos: number;
    aciertos: number;
    total: number;
    racha: { actual: number; mejor: number; incremento: boolean };
    nuevasInsignias: InsigniaObtenida[];
}

/** Cierra la práctica (todos los ejercicios cerrados), dispara la racha (trigger) y evalúa insignias.
 *  Los puntos ya se acreditaron con cada acierto. Idempotente. */
export async function completarPractica(tx: Tx, alumnoId: string, practicaId: string): Promise<PracticaCompletada | FalloPractica> {
    const p = await cargarPractica(tx, alumnoId, practicaId);
    if (!p) return { error: "no_encontrada" };
    const [{ aciertos }] = await tx.$queryRaw<{ aciertos: number }[]>`
        SELECT count(DISTINCT ejercicio_id)::int AS aciertos FROM intento_ejercicio WHERE practica_id = ${p.id}::uuid AND correcta`;
    if (p.completada_en) {
        const r = await racha(tx, alumnoId);
        return { puntos: p.puntos, aciertos, total: p.ejercicios.length, racha: { ...r, incremento: false }, nuevasInsignias: [] };
    }
    const cerrados = await cerradosDe(tx, p.id);
    if (p.ejercicios.some((id) => !cerrados.has(id))) return { error: "incompleta" };

    const antes = await racha(tx, alumnoId);
    await tx.practica_libre.update({ where: { id: p.id }, data: { completada_en: new Date() }, select: { id: true } });
    const despues = await racha(tx, alumnoId);
    return {
        puntos: p.puntos,
        aciertos,
        total: p.ejercicios.length,
        racha: { ...despues, incremento: despues.actual > antes.actual },
        nuevasInsignias: await otorgarInsignias(tx, alumnoId),
    };
}
