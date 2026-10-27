// Reportes del docente: retroalimentación previa (RF-14, RF-62), alertas
// (RF-16, RF-27), índice de error/frustración por tema (RF-18), perfil
// estadístico (RF-19), consolidado académico (RF-35) y cruce emoción–tema (RF-52).
import {
    Actividad,
    Alerta,
    Alumno,
    AsignacionAlumno,
    and,
    db,
    desc,
    eq,
    inArray,
    Intento,
    RegistroEmocion,
    Tema,
} from "astro:db";
import { generarRetroalimentacion, resumenGrupal, type Retroalimentacion } from "../../shared/dominio/retroalimentacion";
import { balancePanas } from "../../shared/dominio/panas";
import { emocionPredominante, valencia } from "../../shared/dominio/emociones";
import { ETIQUETA_ERROR } from "../../shared/dominio/ejercicios";
import { fechaLocal } from "../../shared/dominio/fechas";
import { ultimoDiagnostico, ultimoPanas, type DiagnosticoReciente, type PanasReciente } from "../../shared/servidor/consultas";
import { alumnosDelDocente, type AlumnoResumen } from "./grupos";

export interface FilaRetro extends AlumnoResumen {
    panas: PanasReciente | null;
    diagnostico: DiagnosticoReciente | null;
    deHoy: boolean;
    retro: Retroalimentacion & { precision: number | null };
}

/** Estado emocional y académico más reciente por alumno y del grupo (RF-14, RF-62). */
export async function retroalimentacion(idDocente: number, idGrupo?: number) {
    const alumnos = await alumnosDelDocente(idDocente, idGrupo);
    const hoy = fechaLocal();
    const filas: FilaRetro[] = await Promise.all(
        alumnos.map(async (a) => {
            const [panas, diagnostico] = await Promise.all([ultimoPanas(a.id), ultimoDiagnostico(a.id)]);
            const retro = generarRetroalimentacion({
                panas,
                precision: diagnostico?.precision ?? null,
                resultadoPorTema: diagnostico?.resultado_por_tema ?? null,
            });
            return {
                ...a,
                panas,
                diagnostico,
                deHoy: panas?.fecha_sesion === hoy,
                retro: { ...retro, precision: diagnostico?.precision ?? null },
            };
        }),
    );
    const prioridad = { prioritario: 0, atencion: 1, favorable: 2 } as const;
    filas.sort((x, y) => prioridad[x.retro.semaforo] - prioridad[y.retro.semaforo] || x.nombre.localeCompare(y.nombre));
    return { alumnos: filas, grupo: resumenGrupal(filas.map((f) => f.retro)) };
}

export async function alertasActivas(idDocente: number) {
    const alumnos = await alumnosDelDocente(idDocente);
    if (!alumnos.length) return [];
    const filas = await db
        .select({ alerta: Alerta, tema: Tema.nombre })
        .from(Alerta)
        .leftJoin(Tema, eq(Alerta.id_tema, Tema.id))
        .where(and(inArray(Alerta.id_alumno, alumnos.map((a) => a.id)), eq(Alerta.atendida, false)))
        .orderBy(desc(Alerta.creado_en))
        .limit(50);
    return filas.map((f) => ({
        id: f.alerta.id,
        idAlumno: f.alerta.id_alumno,
        alumno: alumnos.find((a) => a.id === f.alerta.id_alumno)?.nombre ?? "",
        tema: f.tema ?? "—",
        motivo: f.alerta.motivo,
        guiaAceptada: f.alerta.guia_aceptada ?? null,
        creadoEn: f.alerta.creado_en,
    }));
}

export async function marcarAlertaAtendida(idDocente: number, idAlerta: number): Promise<boolean> {
    const propios = (await alumnosDelDocente(idDocente)).map((a) => a.id);
    if (!propios.length) return false;
    const r = await db
        .update(Alerta)
        .set({ atendida: true })
        .where(and(eq(Alerta.id, idAlerta), inArray(Alerta.id_alumno, propios)))
        .returning({ id: Alerta.id });
    return r.length === 1;
}

async function intentosDe(idsAlumno: number[]) {
    if (!idsAlumno.length) return [];
    return db
        .select({ i: Intento, tema: Tema })
        .from(Intento)
        .innerJoin(Tema, eq(Intento.id_tema, Tema.id))
        .where(inArray(Intento.id_alumno, idsAlumno));
}

/** Temas con mayor índice de error o frustración a nivel grupal (RF-18). */
export async function reporteTemas(idDocente: number, idGrupo?: number) {
    const alumnos = await alumnosDelDocente(idDocente, idGrupo);
    const ids = alumnos.map((a) => a.id);
    const [intentos, alertas] = await Promise.all([
        intentosDe(ids),
        ids.length ? db.select().from(Alerta).where(inArray(Alerta.id_alumno, ids)) : Promise.resolve([]),
    ]);
    const porTema = new Map<number, { tema: string; intentos: number; errores: number; negativas: number; alertas: number; alumnos: Set<number> }>();
    for (const { i, tema } of intentos) {
        const t = porTema.get(tema.id) ?? { tema: tema.nombre, intentos: 0, errores: 0, negativas: 0, alertas: 0, alumnos: new Set() };
        t.intentos++;
        if (!i.es_correcta) t.errores++;
        if (valencia(i.emocion) === "negativa") t.negativas++;
        t.alumnos.add(i.id_alumno);
        porTema.set(tema.id, t);
    }
    for (const a of alertas) {
        if (a.id_tema && porTema.has(a.id_tema)) porTema.get(a.id_tema)!.alertas++;
    }
    return [...porTema.entries()]
        .map(([idTema, t]) => ({
            idTema,
            tema: t.tema,
            intentos: t.intentos,
            alumnos: t.alumnos.size,
            indiceError: Math.round((t.errores / t.intentos) * 100),
            indiceFrustracion: Math.round(((t.negativas + t.alertas) / t.intentos) * 100),
            alertas: t.alertas,
        }))
        .sort((a, b) => b.indiceError + b.indiceFrustracion - (a.indiceError + a.indiceFrustracion));
}

/** Perfil estadístico por alumno (RF-19). */
export async function perfilEstadistico(idAlumno: number) {
    const intentos = await intentosDe([idAlumno]);
    const finales = intentos.filter(({ i }) => i.es_correcta || i.uso_guia || i.numero_intento >= 3);
    const resueltosOk = finales.filter(({ i }) => i.es_correcta);
    const tiempoPromedio = resueltosOk.length
        ? Math.round(resueltosOk.reduce((s, { i }) => s + i.tiempo_ms, 0) / resueltosOk.length / 1000)
        : null;

    const errores = new Map<string, number>();
    for (const { i } of intentos) {
        if (!i.es_correcta && i.tipo_error) errores.set(i.tipo_error, (errores.get(i.tipo_error) ?? 0) + 1);
    }
    const porTema = new Map<string, { ok: number; total: number; intentos: number }>();
    for (const { i, tema } of intentos) {
        const t = porTema.get(tema.nombre) ?? { ok: 0, total: 0, intentos: 0 };
        t.intentos++;
        if (i.es_correcta || i.uso_guia || i.numero_intento >= 3) {
            t.total++;
            if (i.es_correcta) t.ok++;
        }
        porTema.set(tema.nombre, t);
    }
    const dominio = [...porTema.entries()]
        .filter(([, t]) => t.total > 0)
        .map(([tema, t]) => ({ tema, precision: Math.round((t.ok / t.total) * 100), ejercicios: t.total }))
        .sort((a, b) => a.precision - b.precision);

    return {
        ejercicios: finales.length,
        intentosTotales: intentos.length,
        intentosPorEjercicio: finales.length ? +(intentos.length / finales.length).toFixed(1) : null,
        tiempoPromedioSeg: tiempoPromedio,
        tiposError: [...errores.entries()]
            .map(([clave, n]) => ({ clave, etiqueta: ETIQUETA_ERROR[clave] ?? clave, n }))
            .sort((a, b) => b.n - a.n),
        menorDominio: dominio.filter((d) => d.precision < 70).slice(0, 3),
        dominio,
    };
}

/** Resultados académicos consolidados por categoría (RF-35). */
export async function consolidadoAcademico(idAlumno: number) {
    const filas = await db
        .select({ a: AsignacionAlumno, act: Actividad, tema: Tema.nombre })
        .from(AsignacionAlumno)
        .innerJoin(Actividad, eq(AsignacionAlumno.id_actividad, Actividad.id))
        .innerJoin(Tema, eq(Actividad.id_tema, Tema.id))
        .where(eq(AsignacionAlumno.id_alumno, idAlumno))
        .orderBy(desc(Actividad.fecha_asignacion));
    const categorias = ["tarea", "trabajo_clase", "interrogacion"] as const;
    return categorias.map((categoria) => {
        const propias = filas.filter((f) => f.act.categoria === categoria);
        const completadas = propias.filter((f) => f.a.estado === "completada");
        return {
            categoria,
            asignadas: propias.length,
            completadas: completadas.length,
            promedio: completadas.length ? Math.round(completadas.reduce((s, f) => s + (f.a.puntaje ?? 0), 0) / completadas.length) : null,
            detalle: propias.map((f) => ({
                actividad: f.act.nombre,
                tema: f.tema,
                fecha: f.act.fecha_asignacion,
                estado: f.a.estado,
                puntaje: f.a.puntaje ?? null,
            })),
        };
    });
}

/** Cruce de desempeño académico con emociones registradas, por tema (RF-52). */
export async function cruceEmocionTema(idAlumno: number) {
    const [intentos, emociones] = await Promise.all([
        intentosDe([idAlumno]),
        db
            .select({ e: RegistroEmocion, tema: Tema.nombre })
            .from(RegistroEmocion)
            .innerJoin(Tema, eq(RegistroEmocion.id_tema, Tema.id))
            .where(eq(RegistroEmocion.id_alumno, idAlumno)),
    ]);
    const temas = new Map<string, { ok: number; finales: number; emociones: string[] }>();
    for (const { i, tema } of intentos) {
        const t = temas.get(tema.nombre) ?? { ok: 0, finales: 0, emociones: [] };
        if (i.es_correcta || i.uso_guia || i.numero_intento >= 3) {
            t.finales++;
            if (i.es_correcta) t.ok++;
        }
        if (i.emocion) t.emociones.push(i.emocion);
        temas.set(tema.nombre, t);
    }
    for (const { e, tema } of emociones) {
        const t = temas.get(tema) ?? { ok: 0, finales: 0, emociones: [] };
        t.emociones.push(e.emocion);
        temas.set(tema, t);
    }
    return [...temas.entries()].map(([tema, t]) => {
        const precision = t.finales ? Math.round((t.ok / t.finales) * 100) : null;
        const negativas = t.emociones.length ? Math.round((t.emociones.filter((x) => valencia(x) === "negativa").length / t.emociones.length) * 100) : null;
        return {
            tema,
            precision,
            emocionPredominante: emocionPredominante(t.emociones),
            porcentajeNegativas: negativas,
            coincidencia: precision !== null && negativas !== null && precision < 60 && negativas >= 40,
        };
    });
}

/** Ficha del alumno para el docente (RF-29). */
export async function fichaAlumno(idAlumno: number) {
    const [panas, diagnostico] = await Promise.all([ultimoPanas(idAlumno), ultimoDiagnostico(idAlumno)]);
    const retro = generarRetroalimentacion({
        panas,
        precision: diagnostico?.precision ?? null,
        resultadoPorTema: diagnostico?.resultado_por_tema ?? null,
    });
    return { panas, balance: panas ? balancePanas(panas) : null, diagnostico, retro };
}
