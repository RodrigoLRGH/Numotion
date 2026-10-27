// Asignación de actividades (RF-56, RF-57), seguimiento (RF-58) e historial (RF-59).
import { Actividad, AsignacionAlumno, Alumno, and, db, desc, eq, gte, Grupo, inArray, lte, Tema, Usuario } from "astro:db";
import { nivelInicialPara } from "../../shared/servidor/consultas";
import { alumnosDelDocente, grupoDelDocente } from "./grupos";

export interface DatosActividad {
    nombre: string;
    idTema: number;
    tipoInteraccion: "seleccion_multiple" | "arrastrar";
    categoria: "tarea" | "trabajo_clase" | "interrogacion";
    numEjercicios: number;
    fechaAsignacion: string;
    destino: { tipo: "grupo"; idGrupo: number } | { tipo: "alumnos"; idAlumnos: number[] };
}

export async function crearActividad(
    idDocente: number,
    d: DatosActividad,
): Promise<{ ok: true; id: number; destinatarios: number } | { ok: false; error: string }> {
    const [tema] = await db.select().from(Tema).where(eq(Tema.id, d.idTema)).limit(1);
    if (!tema || tema.tipo !== "academico") return { ok: false, error: "Tema no asignable" };

    // Destinatarios excluyentes: grupo completo o alumnos seleccionados (RF-56)
    let destinatarios: number[];
    let idGrupo: number | null = null;
    if (d.destino.tipo === "grupo") {
        const grupo = await grupoDelDocente(idDocente, d.destino.idGrupo);
        if (!grupo) return { ok: false, error: "Grupo no encontrado" };
        idGrupo = grupo.id;
        destinatarios = (await alumnosDelDocente(idDocente, grupo.id)).map((a) => a.id);
    } else {
        const propios = new Set((await alumnosDelDocente(idDocente)).map((a) => a.id));
        destinatarios = [...new Set(d.destino.idAlumnos)].filter((id) => propios.has(id));
        if (destinatarios.length !== new Set(d.destino.idAlumnos).size) return { ok: false, error: "Hay alumnos que no pertenecen a tus grupos" };
    }
    if (!destinatarios.length) return { ok: false, error: "No hay alumnos destinatarios" };

    const [act] = await db
        .insert(Actividad)
        .values({
            id_docente: idDocente,
            nombre: d.nombre,
            id_tema: tema.id,
            tipo_interaccion: d.tipoInteraccion,
            categoria: d.categoria,
            num_ejercicios: d.numEjercicios,
            fecha_asignacion: d.fechaAsignacion,
            destino: d.destino.tipo,
            id_grupo: idGrupo,
        })
        .returning({ id: Actividad.id });

    // Nivel inicial individual basado en PANAS-C + diagnóstico (RF-57)
    const filas = await Promise.all(
        destinatarios.map(async (idAlumno) => {
            const nivel = await nivelInicialPara(idAlumno, tema.clave);
            return { id_actividad: act.id, id_alumno: idAlumno, nivel_inicial: nivel, nivel_actual: nivel };
        }),
    );
    await db.insert(AsignacionAlumno).values(filas);
    return { ok: true, id: act.id, destinatarios: filas.length };
}

export async function actividadesDelDocente(idDocente: number) {
    const actividades = await db
        .select({ act: Actividad, tema: Tema, grupo: Grupo })
        .from(Actividad)
        .innerJoin(Tema, eq(Actividad.id_tema, Tema.id))
        .leftJoin(Grupo, eq(Actividad.id_grupo, Grupo.id))
        .where(eq(Actividad.id_docente, idDocente))
        .orderBy(desc(Actividad.fecha_asignacion), desc(Actividad.id));
    if (!actividades.length) return [];

    const asignaciones = await db
        .select({ a: AsignacionAlumno, nombre: Usuario.nombre })
        .from(AsignacionAlumno)
        .innerJoin(Alumno, eq(AsignacionAlumno.id_alumno, Alumno.id))
        .innerJoin(Usuario, eq(Alumno.id_usuario, Usuario.id))
        .where(inArray(AsignacionAlumno.id_actividad, actividades.map((x) => x.act.id)))
        .orderBy(Usuario.nombre);

    return actividades.map(({ act, tema, grupo }) => {
        const propias = asignaciones.filter((x) => x.a.id_actividad === act.id);
        return {
            id: act.id,
            nombre: act.nombre,
            tema: tema.nombre,
            interaccion: act.tipo_interaccion,
            categoria: act.categoria,
            fechaAsignacion: act.fecha_asignacion,
            destino: act.destino === "grupo" ? `Grupo ${grupo?.nombre ?? ""}` : `${propias.length} alumno(s)`,
            resumen: {
                pendiente: propias.filter((x) => x.a.estado === "pendiente").length,
                en_curso: propias.filter((x) => x.a.estado === "en_curso").length,
                completada: propias.filter((x) => x.a.estado === "completada").length,
            },
            alumnos: propias.map((x) => ({
                idAlumno: x.a.id_alumno,
                nombre: x.nombre,
                estado: x.a.estado,
                nivelInicial: x.a.nivel_inicial,
                nivelActual: x.a.nivel_actual,
                avance: `${x.a.ejercicios_resueltos}/${act.num_ejercicios}`,
                puntaje: x.a.puntaje ?? null,
            })),
        };
    });
}

export interface FiltrosHistorial {
    idAlumno?: number;
    idGrupo?: number;
    idTema?: number;
    desde?: string; // YYYY-MM-DD
    hasta?: string;
}

/** Actividades finalizadas en orden cronológico (RF-59). */
export async function historial(idDocente: number, f: FiltrosHistorial) {
    const condiciones = [eq(Actividad.id_docente, idDocente), eq(AsignacionAlumno.estado, "completada")];
    if (f.idAlumno) condiciones.push(eq(AsignacionAlumno.id_alumno, f.idAlumno));
    if (f.idGrupo) condiciones.push(eq(Alumno.id_grupo, f.idGrupo));
    if (f.idTema) condiciones.push(eq(Actividad.id_tema, f.idTema));
    if (f.desde) condiciones.push(gte(AsignacionAlumno.completada_en, new Date(`${f.desde}T00:00:00-06:00`)));
    if (f.hasta) condiciones.push(lte(AsignacionAlumno.completada_en, new Date(`${f.hasta}T23:59:59-06:00`)));

    const filas = await db
        .select({ a: AsignacionAlumno, act: Actividad, tema: Tema, nombre: Usuario.nombre, grupo: Grupo.nombre })
        .from(AsignacionAlumno)
        .innerJoin(Actividad, eq(AsignacionAlumno.id_actividad, Actividad.id))
        .innerJoin(Tema, eq(Actividad.id_tema, Tema.id))
        .innerJoin(Alumno, eq(AsignacionAlumno.id_alumno, Alumno.id))
        .innerJoin(Usuario, eq(Alumno.id_usuario, Usuario.id))
        .innerJoin(Grupo, eq(Alumno.id_grupo, Grupo.id))
        .where(and(...condiciones))
        .orderBy(desc(AsignacionAlumno.completada_en));

    return filas.map((x) => ({
        id: x.a.id,
        alumno: x.nombre,
        idAlumno: x.a.id_alumno,
        grupo: x.grupo,
        actividad: x.act.nombre,
        tema: x.tema.nombre,
        categoria: x.act.categoria,
        completadaEn: x.a.completada_en ?? null,
        puntaje: x.a.puntaje ?? 0,
        aciertos: x.a.aciertos,
        total: x.act.num_ejercicios,
    }));
}
