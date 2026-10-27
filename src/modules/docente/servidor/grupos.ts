// Grupos y alumnos del docente. Toda consulta filtra por id_docente para que un
// docente solo vea a los alumnos de sus grupos (RNF-04).
import { Alumno, and, count, db, eq, Grupo, inArray, Usuario } from "astro:db";
import { hashPassword } from "../../shared/servidor/auth";

export async function gruposDeDocente(idDocente: number) {
    const grupos = await db.select().from(Grupo).where(eq(Grupo.id_docente, idDocente)).orderBy(Grupo.nombre);
    if (!grupos.length) return [];
    const conteos = await db
        .select({ id_grupo: Alumno.id_grupo, n: count() })
        .from(Alumno)
        .where(inArray(Alumno.id_grupo, grupos.map((g) => g.id)))
        .groupBy(Alumno.id_grupo);
    return grupos.map((g) => ({ ...g, alumnos: conteos.find((c) => c.id_grupo === g.id)?.n ?? 0 }));
}

export async function grupoDelDocente(idDocente: number, idGrupo: number) {
    const [g] = await db.select().from(Grupo).where(and(eq(Grupo.id, idGrupo), eq(Grupo.id_docente, idDocente))).limit(1);
    return g ?? null;
}

export interface AlumnoResumen {
    id: number;
    nombre: string;
    usuario: string;
    grado: number;
    idGrupo: number;
    grupo: string;
    consentimiento: boolean;
}

export async function alumnosDelDocente(idDocente: number, idGrupo?: number): Promise<AlumnoResumen[]> {
    const filas = await db
        .select({ alumno: Alumno, usuario: Usuario, grupo: Grupo })
        .from(Alumno)
        .innerJoin(Grupo, eq(Alumno.id_grupo, Grupo.id))
        .innerJoin(Usuario, eq(Alumno.id_usuario, Usuario.id))
        .where(idGrupo ? and(eq(Grupo.id_docente, idDocente), eq(Grupo.id, idGrupo)) : eq(Grupo.id_docente, idDocente))
        .orderBy(Usuario.nombre);
    return filas.map((f) => ({
        id: f.alumno.id,
        nombre: f.usuario.nombre,
        usuario: f.usuario.usuario,
        grado: f.alumno.grado,
        idGrupo: f.grupo.id,
        grupo: f.grupo.nombre,
        consentimiento: f.alumno.consentimiento_tutor,
    }));
}

/** Devuelve el alumno solo si pertenece a un grupo del docente (RNF-04). */
export async function alumnoDelDocente(idDocente: number, idAlumno: number) {
    const [f] = await db
        .select({ alumno: Alumno, usuario: Usuario, grupo: Grupo })
        .from(Alumno)
        .innerJoin(Grupo, eq(Alumno.id_grupo, Grupo.id))
        .innerJoin(Usuario, eq(Alumno.id_usuario, Usuario.id))
        .where(and(eq(Alumno.id, idAlumno), eq(Grupo.id_docente, idDocente)))
        .limit(1);
    return f ?? null;
}

export async function crearGrupo(idDocente: number, datos: { nombre: string; grado: number; ciclo: string }) {
    const [g] = await db.insert(Grupo).values({ id_docente: idDocente, ...datos }).returning();
    return g;
}

export interface DatosAlumnoNuevo {
    idGrupo: number;
    nombre: string;
    usuario: string;
    password: string;
    tutorNombre: string;
    tutorContacto: string;
    consentimiento: true;
}

export async function crearAlumno(idDocente: number, d: DatosAlumnoNuevo): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
    const grupo = await grupoDelDocente(idDocente, d.idGrupo);
    if (!grupo) return { ok: false, error: "Grupo no encontrado" };
    const [existe] = await db.select({ id: Usuario.id }).from(Usuario).where(eq(Usuario.usuario, d.usuario)).limit(1);
    if (existe) return { ok: false, error: "Ese nombre de usuario ya existe" };

    const [u] = await db
        .insert(Usuario)
        .values({ nombre: d.nombre, usuario: d.usuario, password_hash: await hashPassword(d.password), rol: "alumno" })
        .returning({ id: Usuario.id });
    const [a] = await db
        .insert(Alumno)
        .values({
            id_usuario: u.id,
            id_grupo: grupo.id,
            grado: grupo.grado,
            consentimiento_tutor: d.consentimiento,
            tutor_nombre: d.tutorNombre,
            tutor_contacto: d.tutorContacto,
            consentimiento_fecha: new Date(),
        })
        .returning({ id: Alumno.id });
    return { ok: true, id: a.id };
}
