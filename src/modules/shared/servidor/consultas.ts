// Consultas de lectura compartidas por los módulos alumno y docente.
import { db, desc, eq, DiagnosticoMatematico, DiagnosticoPanas, Tema } from "astro:db";
import { balancePanas, type PuntajePanas } from "../dominio/panas";
import { nivelInicial } from "../dominio/dificultad";
import type { ResultadoTema } from "../dominio/ejercicios";

export interface PanasReciente extends PuntajePanas {
    fecha_sesion: string;
    creado_en: Date;
}

export async function ultimoPanas(idAlumno: number): Promise<PanasReciente | null> {
    const [fila] = await db
        .select()
        .from(DiagnosticoPanas)
        .where(eq(DiagnosticoPanas.id_alumno, idAlumno))
        .orderBy(desc(DiagnosticoPanas.creado_en))
        .limit(1);
    return fila
        ? { afecto_positivo: fila.afecto_positivo, afecto_negativo: fila.afecto_negativo, fecha_sesion: fila.fecha_sesion, creado_en: fila.creado_en }
        : null;
}

export interface DiagnosticoReciente {
    fecha_sesion: string;
    aciertos: number;
    total: number;
    precision: number;
    tiempo_promedio_ms: number;
    resultado_por_tema: Record<string, ResultadoTema>;
}

export async function ultimoDiagnostico(idAlumno: number): Promise<DiagnosticoReciente | null> {
    const [fila] = await db
        .select()
        .from(DiagnosticoMatematico)
        .where(eq(DiagnosticoMatematico.id_alumno, idAlumno))
        .orderBy(desc(DiagnosticoMatematico.creado_en))
        .limit(1);
    return fila
        ? {
              fecha_sesion: fila.fecha_sesion,
              aciertos: fila.aciertos,
              total: fila.total,
              precision: fila.precision,
              tiempo_promedio_ms: fila.tiempo_promedio_ms,
              resultado_por_tema: fila.resultado_por_tema as Record<string, ResultadoTema>,
          }
        : null;
}

/** Nivel inicial de un alumno en un tema según sus diagnósticos más recientes (RF-57). */
export async function nivelInicialPara(idAlumno: number, claveTema: string): Promise<number> {
    const [panas, diag] = await Promise.all([ultimoPanas(idAlumno), ultimoDiagnostico(idAlumno)]);
    const precision = diag?.resultado_por_tema[claveTema]?.precision ?? null;
    return nivelInicial(precision, panas ? balancePanas(panas) : null);
}

export async function temas() {
    return db.select().from(Tema).orderBy(Tema.orden);
}

export async function temaPorId(id: number) {
    const [t] = await db.select().from(Tema).where(eq(Tema.id, id)).limit(1);
    return t ?? null;
}
