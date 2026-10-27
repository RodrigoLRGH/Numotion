// Motor de resolución de ejercicios del alumno (RF-01, RF-11, RF-16, RF-21,
// RF-45, RF-47, RF-60). Opera sobre dos contextos: una asignación del docente o
// una sesión de práctica libre. El ejercicio vigente (con respuesta) solo vive
// en el servidor.
import {
    Actividad,
    Alerta,
    Alumno,
    AsignacionAlumno,
    and,
    count,
    db,
    desc,
    eq,
    gte,
    InsigniaAlumno,
    Intento,
    isNotNull,
    isNull,
    RegistroEmocion,
    SesionPractica,
    sql,
    Tema,
} from "astro:db";
import {
    aPublico,
    clasificarError,
    evaluarRespuesta,
    generarEjercicio,
    type ClaveTema,
    type Ejercicio,
    type EjercicioPublico,
    type TipoInteraccion,
} from "../../shared/dominio/ejercicios";
import { ajustarNivel } from "../../shared/dominio/dificultad";
import { detectarFrustracion, GUIA_CALMA_ALUMNO, MAX_INTENTOS_EJERCICIO } from "../../shared/dominio/frustracion";
import { esEmocion, type Emocion } from "../../shared/dominio/emociones";
import { insigniaPorClave, insigniasMerecidas, puntosPorRespuesta, type Insignia } from "../../shared/dominio/gamificacion";
import { registrarActividadLudica } from "../../shared/dominio/racha";
import { fechaLocal } from "../../shared/dominio/fechas";

export type Contexto = { tipo: "asignacion"; id: number } | { tipo: "practica"; id: number };

interface Estado {
    contexto: Contexto;
    idAlumno: number;
    idTema: number;
    claveTema: ClaveTema;
    nombreTema: string;
    titulo: string;
    interaccion: TipoInteraccion;
    nivel: number;
    resueltos: number;
    aciertos: number;
    objetivo: number;
    ejercicio: Ejercicio | null;
    intentos: number;
    completada: boolean;
}

export interface Progreso {
    titulo: string;
    tema: string;
    nivel: number;
    resueltos: number;
    aciertos: number;
    objetivo: number;
    completada: boolean;
}

function progresoDe(e: Estado): Progreso {
    return {
        titulo: e.titulo,
        tema: e.nombreTema,
        nivel: e.nivel,
        resueltos: e.resueltos,
        aciertos: e.aciertos,
        objetivo: e.objetivo,
        completada: e.completada,
    };
}

export async function cargarEstado(idAlumno: number, contexto: Contexto): Promise<Estado | null> {
    if (contexto.tipo === "asignacion") {
        const [f] = await db
            .select({ a: AsignacionAlumno, act: Actividad, tema: Tema })
            .from(AsignacionAlumno)
            .innerJoin(Actividad, eq(AsignacionAlumno.id_actividad, Actividad.id))
            .innerJoin(Tema, eq(Actividad.id_tema, Tema.id))
            .where(and(eq(AsignacionAlumno.id, contexto.id), eq(AsignacionAlumno.id_alumno, idAlumno)))
            .limit(1);
        if (!f) return null;
        return {
            contexto,
            idAlumno,
            idTema: f.tema.id,
            claveTema: f.tema.clave as ClaveTema,
            nombreTema: f.tema.nombre,
            titulo: f.act.nombre,
            interaccion: f.act.tipo_interaccion as TipoInteraccion,
            nivel: f.a.nivel_actual,
            resueltos: f.a.ejercicios_resueltos,
            aciertos: f.a.aciertos,
            objetivo: f.act.num_ejercicios,
            ejercicio: (f.a.ejercicio_actual as Ejercicio | null) ?? null,
            intentos: f.a.intentos_ejercicio,
            completada: f.a.estado === "completada",
        };
    }
    const [f] = await db
        .select({ p: SesionPractica, tema: Tema })
        .from(SesionPractica)
        .innerJoin(Tema, eq(SesionPractica.id_tema, Tema.id))
        .where(and(eq(SesionPractica.id, contexto.id), eq(SesionPractica.id_alumno, idAlumno)))
        .limit(1);
    if (!f) return null;
    return {
        contexto,
        idAlumno,
        idTema: f.tema.id,
        claveTema: f.tema.clave as ClaveTema,
        nombreTema: f.tema.nombre,
        titulo: `Práctica libre: ${f.tema.nombre}`,
        interaccion: f.p.tipo_interaccion as TipoInteraccion,
        nivel: f.p.nivel_actual,
        resueltos: f.p.ejercicios_resueltos,
        aciertos: f.p.aciertos,
        objetivo: f.p.total_objetivo,
        ejercicio: (f.p.ejercicio_actual as Ejercicio | null) ?? null,
        intentos: f.p.intentos_ejercicio,
        completada: f.p.completada_en !== null && f.p.completada_en !== undefined,
    };
}

function filtroContexto(c: Contexto) {
    return c.tipo === "asignacion" ? eq(Intento.id_asignacion, c.id) : eq(Intento.id_practica, c.id);
}

export interface RespuestaSiguiente {
    progreso: Progreso;
    ejercicio: EjercicioPublico | null;
    intentosRestantes: number;
}

/** Devuelve el ejercicio vigente (retomar, RF-64) o genera uno nuevo. */
export async function siguienteEjercicio(idAlumno: number, contexto: Contexto): Promise<RespuestaSiguiente | null> {
    const e = await cargarEstado(idAlumno, contexto);
    if (!e) return null;
    if (e.completada) return { progreso: progresoDe(e), ejercicio: null, intentosRestantes: 0 };
    if (e.ejercicio) {
        return { progreso: progresoDe(e), ejercicio: aPublico(e.ejercicio), intentosRestantes: MAX_INTENTOS_EJERCICIO - e.intentos };
    }
    const nuevo = generarEjercicio(e.claveTema, e.nivel, e.interaccion);
    if (contexto.tipo === "asignacion") {
        await db
            .update(AsignacionAlumno)
            .set({ ejercicio_actual: nuevo, intentos_ejercicio: 0, estado: "en_curso" })
            .where(eq(AsignacionAlumno.id, contexto.id));
        await db
            .update(AsignacionAlumno)
            .set({ iniciada_en: new Date() })
            .where(and(eq(AsignacionAlumno.id, contexto.id), isNull(AsignacionAlumno.iniciada_en)));
    } else {
        await db.update(SesionPractica).set({ ejercicio_actual: nuevo, intentos_ejercicio: 0 }).where(eq(SesionPractica.id, contexto.id));
    }
    return { progreso: progresoDe(e), ejercicio: aPublico(nuevo), intentosRestantes: MAX_INTENTOS_EJERCICIO };
}

export interface ResultadoRespuesta {
    correcta: boolean;
    terminado: boolean; // el ejercicio ya no admite más intentos
    intentosRestantes: number;
    puntosGanados: number;
    /** Solución guiada: tras agotar intentos (RF-11, RF-45) o al pedirla. */
    guia: { pasos: string[]; respuesta: string } | null;
    progreso: Progreso;
    insigniasNuevas: Insignia[];
    alerta: { id: number; pasosCalma: readonly string[] } | null;
}

async function emocionesRecientes(idAlumno: number): Promise<Emocion[]> {
    const desde = new Date(Date.now() - 60_000);
    const filas = await db
        .select({ emocion: RegistroEmocion.emocion })
        .from(RegistroEmocion)
        .where(and(eq(RegistroEmocion.id_alumno, idAlumno), gte(RegistroEmocion.creado_en, desde)))
        .orderBy(desc(RegistroEmocion.creado_en))
        .limit(5);
    return filas.map((f) => f.emocion).filter(esEmocion);
}

/** Bloquea el ejercicio vigente comparando contadores (evita doble envío). */
async function reclamar(e: Estado, cambios: Record<string, unknown>): Promise<boolean> {
    if (e.contexto.tipo === "asignacion") {
        const r = await db
            .update(AsignacionAlumno)
            .set(cambios)
            .where(and(
                eq(AsignacionAlumno.id, e.contexto.id),
                eq(AsignacionAlumno.intentos_ejercicio, e.intentos),
                eq(AsignacionAlumno.ejercicios_resueltos, e.resueltos),
            ))
            .returning({ id: AsignacionAlumno.id });
        return r.length === 1;
    }
    const r = await db
        .update(SesionPractica)
        .set(cambios)
        .where(and(
            eq(SesionPractica.id, e.contexto.id),
            eq(SesionPractica.intentos_ejercicio, e.intentos),
            eq(SesionPractica.ejercicios_resueltos, e.resueltos),
        ))
        .returning({ id: SesionPractica.id });
    return r.length === 1;
}

async function resultadosFinalesRecientes(c: Contexto) {
    const filas = await db
        .select({ es_correcta: Intento.es_correcta, numero_intento: Intento.numero_intento, uso_guia: Intento.uso_guia })
        .from(Intento)
        .where(filtroContexto(c))
        .orderBy(desc(Intento.id))
        .limit(12);
    return filas.filter((f) => f.es_correcta || f.uso_guia || f.numero_intento >= MAX_INTENTOS_EJERCICIO);
}

async function erroresConsecutivos(c: Contexto): Promise<number> {
    const filas = await db.select({ es_correcta: Intento.es_correcta }).from(Intento).where(filtroContexto(c)).orderBy(desc(Intento.id)).limit(10);
    let n = 0;
    for (const f of filas) {
        if (f.es_correcta) break;
        n++;
    }
    return n;
}

async function evaluarAlerta(e: Estado, intentosEjercicio: number): Promise<ResultadoRespuesta["alerta"]> {
    const filtroAlerta = e.contexto.tipo === "asignacion" ? eq(Alerta.id_asignacion, e.contexto.id) : eq(Alerta.id_alumno, e.idAlumno);
    const [ultima] = await db.select({ creado_en: Alerta.creado_en }).from(Alerta).where(filtroAlerta).orderBy(desc(Alerta.creado_en)).limit(1);
    const resultado = detectarFrustracion({
        erroresConsecutivos: await erroresConsecutivos(e.contexto),
        intentosEjercicioActual: intentosEjercicio,
        emocionesRecientes: await emocionesRecientes(e.idAlumno),
        minutosDesdeUltimaAlerta: ultima ? (Date.now() - ultima.creado_en.getTime()) / 60_000 : null,
    });
    if (!resultado.alerta || !resultado.motivo) return null;
    const [fila] = await db
        .insert(Alerta)
        .values({
            id_alumno: e.idAlumno,
            id_tema: e.idTema,
            id_asignacion: e.contexto.tipo === "asignacion" ? e.contexto.id : null,
            tipo: "frustracion",
            motivo: resultado.motivo,
        })
        .returning({ id: Alerta.id });
    return { id: fila.id, pasosCalma: GUIA_CALMA_ALUMNO };
}

async function otorgarInsignias(idAlumno: number, claves: string[]): Promise<Insignia[]> {
    if (!claves.length) return [];
    const existentes = new Set(
        (await db.select({ clave: InsigniaAlumno.clave }).from(InsigniaAlumno).where(eq(InsigniaAlumno.id_alumno, idAlumno))).map((f) => f.clave),
    );
    const nuevas = claves.filter((c) => !existentes.has(c));
    if (!nuevas.length) return [];
    await db.insert(InsigniaAlumno).values(nuevas.map((clave) => ({ id_alumno: idAlumno, clave }))).onConflictDoNothing();
    return nuevas.map(insigniaPorClave).filter((i): i is Insignia => Boolean(i));
}

/** Cierra el ejercicio vigente y, si corresponde, la actividad completa. */
async function cerrarEjercicio(
    e: Estado,
    correcta: boolean,
    numeroIntento: number,
    emocion: Emocion | null,
): Promise<{ progreso: Progreso; insignias: Insignia[]; reclamado: boolean }> {
    const resueltos = e.resueltos + 1;
    const aciertos = e.aciertos + (correcta ? 1 : 0);
    const completada = resueltos >= e.objetivo;
    const recientes = [{ es_correcta: correcta, numero_intento: numeroIntento }, ...(await resultadosFinalesRecientes(e.contexto))];
    const nivel = ajustarNivel(e.nivel, recientes, emocion);

    const comunes = { ejercicio_actual: null, intentos_ejercicio: 0, ejercicios_resueltos: resueltos, aciertos, nivel_actual: nivel };
    const ok =
        e.contexto.tipo === "asignacion"
            ? await reclamar(e, {
                  ...comunes,
                  ...(completada ? { estado: "completada", completada_en: new Date(), puntaje: Math.round((aciertos / e.objetivo) * 100) } : {}),
              })
            : await reclamar(e, { ...comunes, ...(completada ? { completada_en: new Date() } : {}) });

    const estadoNuevo: Estado = { ...e, resueltos, aciertos, nivel, completada, ejercicio: null, intentos: 0 };
    if (!ok) return { progreso: progresoDe(e), insignias: [], reclamado: false };

    let rachaActual = 0;
    if (completada && e.contexto.tipo === "practica") {
        const [al] = await db.select().from(Alumno).where(eq(Alumno.id, e.idAlumno)).limit(1);
        const r = registrarActividadLudica(
            { racha_actual: al.racha_actual, mejor_racha: al.mejor_racha, ultima_fecha_racha: al.ultima_fecha_racha ?? null },
            fechaLocal(),
        );
        await db.update(Alumno).set(r).where(eq(Alumno.id, e.idAlumno));
        rachaActual = r.racha_actual;
    }

    let insignias: Insignia[] = [];
    if (completada || nivel >= 5 || (correcta && numeroIntento > 1)) {
        const [{ n: actividades }] = await db
            .select({ n: count() })
            .from(AsignacionAlumno)
            .where(and(eq(AsignacionAlumno.id_alumno, e.idAlumno), eq(AsignacionAlumno.estado, "completada")));
        const [{ n: practicas }] = await db
            .select({ n: count() })
            .from(SesionPractica)
            .where(and(eq(SesionPractica.id_alumno, e.idAlumno), isNotNull(SesionPractica.completada_en)));
        insignias = await otorgarInsignias(
            e.idAlumno,
            insigniasMerecidas({
                actividadesCompletadas: actividades,
                actividadPerfecta: completada && e.contexto.tipo === "asignacion" && aciertos === e.objetivo,
                practicasCompletadas: practicas,
                rachaActual,
                nivelAlcanzado: nivel,
                resolvioTrasError: correcta && numeroIntento > 1,
            }),
        );
    }
    return { progreso: progresoDe(estadoNuevo), insignias, reclamado: true };
}

export async function responder(
    idAlumno: number,
    contexto: Contexto,
    respuesta: string,
    tiempoMs: number,
): Promise<ResultadoRespuesta | { error: string; status: number }> {
    const e = await cargarEstado(idAlumno, contexto);
    if (!e) return { error: "Actividad no encontrada", status: 404 };
    if (e.completada) return { error: "La actividad ya está completada", status: 409 };
    if (!e.ejercicio) return { error: "No hay un ejercicio en curso", status: 409 };

    const ejercicio = e.ejercicio;
    const { correcta } = evaluarRespuesta(ejercicio, respuesta);
    const numeroIntento = e.intentos + 1;
    const terminado = correcta || numeroIntento >= MAX_INTENTOS_EJERCICIO;
    const [emocion] = await emocionesRecientes(idAlumno);

    let progreso = progresoDe(e);
    let insigniasNuevas: Insignia[] = [];
    if (terminado) {
        const r = await cerrarEjercicio(e, correcta, numeroIntento, emocion ?? null);
        if (!r.reclamado) return { error: "Esta respuesta ya fue registrada", status: 409 };
        progreso = r.progreso;
        insigniasNuevas = r.insignias;
    } else if (!(await reclamar(e, { intentos_ejercicio: numeroIntento }))) {
        return { error: "Esta respuesta ya fue registrada", status: 409 };
    }

    await db.insert(Intento).values({
        id_alumno: idAlumno,
        id_tema: e.idTema,
        id_asignacion: contexto.tipo === "asignacion" ? contexto.id : null,
        id_practica: contexto.tipo === "practica" ? contexto.id : null,
        nivel: e.nivel,
        ejercicio,
        respuesta: respuesta.slice(0, 200),
        es_correcta: correcta,
        numero_intento: numeroIntento,
        tiempo_ms: Math.max(0, Math.min(Math.round(tiempoMs), 30 * 60_000)),
        tipo_error: correcta ? null : clasificarError(ejercicio, respuesta),
        emocion: emocion ?? null,
    });

    const puntosGanados = correcta ? puntosPorRespuesta(e.nivel, numeroIntento) : 0;
    if (puntosGanados) {
        await db.update(Alumno).set({ puntos: sql`${Alumno.puntos} + ${puntosGanados}` }).where(eq(Alumno.id, idAlumno));
    }

    const alerta = correcta ? null : await evaluarAlerta(e, numeroIntento);

    return {
        correcta,
        terminado,
        intentosRestantes: terminado ? 0 : MAX_INTENTOS_EJERCICIO - numeroIntento,
        puntosGanados,
        guia: !correcta && terminado ? { pasos: ejercicio.pasos, respuesta: ejercicio.respuesta } : null,
        progreso,
        insigniasNuevas,
        alerta,
    };
}

/** Solución guiada a solicitud del alumno (RF-11): cierra el ejercicio sin puntos. */
export async function pedirGuia(
    idAlumno: number,
    contexto: Contexto,
): Promise<{ guia: { pasos: string[]; respuesta: string }; progreso: Progreso } | { error: string; status: number }> {
    const e = await cargarEstado(idAlumno, contexto);
    if (!e) return { error: "Actividad no encontrada", status: 404 };
    if (!e.ejercicio) return { error: "No hay un ejercicio en curso", status: 409 };
    const ejercicio = e.ejercicio;
    const [emocion] = await emocionesRecientes(idAlumno);
    const r = await cerrarEjercicio(e, false, MAX_INTENTOS_EJERCICIO, emocion ?? null);
    if (!r.reclamado) return { error: "El ejercicio ya fue cerrado", status: 409 };
    await db.insert(Intento).values({
        id_alumno: idAlumno,
        id_tema: e.idTema,
        id_asignacion: contexto.tipo === "asignacion" ? contexto.id : null,
        id_practica: contexto.tipo === "practica" ? contexto.id : null,
        nivel: e.nivel,
        ejercicio,
        respuesta: "",
        es_correcta: false,
        numero_intento: e.intentos + 1,
        tiempo_ms: 0,
        tipo_error: "con_ayuda",
        emocion: emocion ?? null,
        uso_guia: true,
    });
    return { guia: { pasos: ejercicio.pasos, respuesta: ejercicio.respuesta }, progreso: r.progreso };
}
