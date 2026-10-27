// Notas rápidas del docente sobre un alumno (RF-50): fecha automática, texto
// libre y etiqueta opcional.
import { and, db, desc, eq, Nota } from "astro:db";
import { alumnoDelDocente } from "./grupos";

export const ETIQUETAS_NOTA = ["conducta", "emocional", "académico", "familia", "logro"] as const;

export async function notasDeAlumno(idDocente: number, idAlumno: number) {
    return db
        .select()
        .from(Nota)
        .where(and(eq(Nota.id_docente, idDocente), eq(Nota.id_alumno, idAlumno)))
        .orderBy(desc(Nota.fecha));
}

export async function crearNota(idDocente: number, idAlumno: number, texto: string, etiqueta: string | null) {
    if (!(await alumnoDelDocente(idDocente, idAlumno))) return null;
    const [n] = await db.insert(Nota).values({ id_docente: idDocente, id_alumno: idAlumno, texto, etiqueta }).returning();
    return n;
}
