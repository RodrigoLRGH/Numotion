// Alertas tempranas y guía de actuación del lado docente (RF-16, RF-27, EXP-05.5, EXP-05.6).
// RLS: el docente solo ve las alertas dirigidas a él (docente_id = app_user()).
import { num, Prisma, type Tx } from "../../infra/db";

export interface Alerta {
    alertaId: string;
    alumno: { id: string; nombre: string; avatar: string };
    actividad: string | null;
    tema: string | null;
    asignacionId: string | null;
    indice: number;
    senales: { estado?: string | null; erroresConsecutivos?: number; inactividadSeg?: number; ayudas?: number; sinCamara?: boolean; descripcion?: string[] };
    guia: { id: string; titulo: string } | null;
    alumnoAceptoAyuda: boolean | null;
    atendidaEn: string | null;
    creadaEn: string;
}

interface Fila {
    id: string;
    alumno_id: string;
    nombre: string;
    avatar: string;
    actividad: string | null;
    tema: string | null;
    asignacion_id: string | null;
    indice: Prisma.Decimal;
    senales: Alerta["senales"];
    guia_id: string | null;
    guia_titulo: string | null;
    acepto: boolean | null;
    atendida_en: Date | null;
    creado_en: Date;
}

const aAlerta = (f: Fila): Alerta => ({
    alertaId: f.id,
    alumno: { id: f.alumno_id, nombre: f.nombre, avatar: f.avatar },
    actividad: f.actividad,
    tema: f.tema,
    asignacionId: f.asignacion_id,
    indice: num(f.indice) ?? 0,
    senales: f.senales ?? {},
    guia: f.guia_id && f.guia_titulo ? { id: f.guia_id, titulo: f.guia_titulo } : null,
    alumnoAceptoAyuda: f.acepto,
    atendidaEn: f.atendida_en?.toISOString() ?? null,
    creadaEn: f.creado_en.toISOString(),
});

export async function alertas(tx: Tx, f: { pendientes?: boolean; despuesDe?: Date; grupoId?: string; alumnoId?: string; limite?: number }): Promise<Alerta[]> {
    const filas = await tx.$queryRaw<Fila[]>`
        SELECT al.id, al.alumno_id, trim(a.nombre || ' ' || a.apellidos) AS nombre, a.avatar, ac.nombre AS actividad, t.nombre AS tema,
               al.asignacion_id, al.indice, al.senales, al.guia_id, g.titulo AS guia_titulo, al.alumno_acepto_ayuda AS acepto,
               al.atendida_en, al.creado_en
          FROM alerta al JOIN alumno a ON a.id = al.alumno_id
          LEFT JOIN asignacion_alumno s ON s.id = al.asignacion_id
          LEFT JOIN actividad ac ON ac.id = s.actividad_id LEFT JOIN tema t ON t.id = ac.tema_id
          LEFT JOIN guia_actuacion g ON g.id = al.guia_id
         WHERE true
           ${f.pendientes ? Prisma.sql`AND al.atendida_en IS NULL` : Prisma.empty}
           ${f.despuesDe ? Prisma.sql`AND al.creado_en > ${f.despuesDe}` : Prisma.empty}
           ${f.grupoId ? Prisma.sql`AND a.grupo_id = ${f.grupoId}::uuid` : Prisma.empty}
           ${f.alumnoId ? Prisma.sql`AND al.alumno_id = ${f.alumnoId}::uuid` : Prisma.empty}
         ORDER BY al.creado_en DESC LIMIT ${Math.min(f.limite ?? 50, 200)}`;
    return filas.map(aAlerta);
}

export async function guia(tx: Tx, id: string): Promise<{ id: string; estado: string; titulo: string; pasos: { orden: number; texto: string }[] } | null> {
    const g = await tx.guia_actuacion.findUnique({ where: { id }, select: { id: true, estado: true, titulo: true, pasos: true } });
    return g ? { id: g.id, estado: g.estado, titulo: g.titulo, pasos: g.pasos as { orden: number; texto: string }[] } : null;
}

/** Marca la alerta como atendida; con nota, crea una nota rápida etiquetada "emocional" (≤ 2 clics, EXP-07.5). */
export async function atenderAlerta(tx: Tx, docenteId: string, alertaId: string, nota?: string): Promise<boolean> {
    const a = await tx.alerta.findUnique({ where: { id: alertaId }, select: { id: true, alumno_id: true, atendida_en: true } });
    if (!a) return false;
    if (!a.atendida_en) await tx.alerta.update({ where: { id: a.id }, data: { atendida_en: new Date(), atendida_por: docenteId }, select: { id: true } });
    if (nota?.trim()) {
        await tx.nota_docente.create({ data: { docente_id: docenteId, alumno_id: a.alumno_id, texto: nota.trim().slice(0, 500), etiqueta: "emocional" }, select: { id: true } });
    }
    return true;
}
