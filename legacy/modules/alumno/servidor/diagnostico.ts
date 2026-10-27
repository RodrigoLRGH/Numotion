// Diagnóstico emocional PANAS-C (RF-54) y matemático (RF-55) por sesión de clase.
import { and, db, eq, DiagnosticoMatematico, DiagnosticoPanas } from "astro:db";
import { semillaDeTexto } from "../../shared/dominio/aleatorio";
import { calcularPanas, validarRespuestasPanas, type PuntajePanas, type RespuestaPanas } from "../../shared/dominio/panas";
import {
    aPublico,
    calificarDiagnostico,
    generarDiagnostico,
    type EjercicioPublico,
    type RespuestaDiagnostico,
    type ResultadoDiagnostico,
} from "../../shared/dominio/ejercicios";
import type { EstadoDiagnosticos } from "../../shared/servidor/guardas";

export async function estadoDiagnosticos(idAlumno: number, fecha: string): Promise<EstadoDiagnosticos> {
    const [panas, mate] = await Promise.all([
        db.select({ id: DiagnosticoPanas.id }).from(DiagnosticoPanas)
            .where(and(eq(DiagnosticoPanas.id_alumno, idAlumno), eq(DiagnosticoPanas.fecha_sesion, fecha))).limit(1),
        db.select({ id: DiagnosticoMatematico.id }).from(DiagnosticoMatematico)
            .where(and(eq(DiagnosticoMatematico.id_alumno, idAlumno), eq(DiagnosticoMatematico.fecha_sesion, fecha))).limit(1),
    ]);
    return { panas: panas.length > 0, matematico: mate.length > 0 };
}

export async function registrarPanas(
    idAlumno: number,
    fecha: string,
    respuestas: RespuestaPanas[],
): Promise<{ ok: true; puntaje: PuntajePanas } | { ok: false; error: string }> {
    const invalido = validarRespuestasPanas(respuestas);
    if (invalido) return { ok: false, error: invalido };
    const estado = await estadoDiagnosticos(idAlumno, fecha);
    if (estado.panas) return { ok: false, error: "Ya respondiste el cuestionario de hoy." };
    const puntaje = calcularPanas(respuestas);
    await db.insert(DiagnosticoPanas).values({ id_alumno: idAlumno, fecha_sesion: fecha, respuestas, ...puntaje });
    return { ok: true, puntaje };
}

function semilla(idAlumno: number, fecha: string): number {
    return semillaDeTexto(`diagnostico|${idAlumno}|${fecha}`);
}

export function preguntasDiagnostico(idAlumno: number, fecha: string): EjercicioPublico[] {
    return generarDiagnostico(semilla(idAlumno, fecha)).map(aPublico);
}

export async function registrarDiagnostico(
    idAlumno: number,
    fecha: string,
    respuestas: RespuestaDiagnostico[],
): Promise<{ ok: true; resultado: ResultadoDiagnostico } | { ok: false; error: string }> {
    const estado = await estadoDiagnosticos(idAlumno, fecha);
    if (!estado.panas) return { ok: false, error: "Primero responde el cuestionario emocional." };
    if (estado.matematico) return { ok: false, error: "Ya realizaste el diagnóstico de hoy." };
    const resultado = calificarDiagnostico(generarDiagnostico(semilla(idAlumno, fecha)), respuestas);
    await db.insert(DiagnosticoMatematico).values({
        id_alumno: idAlumno,
        fecha_sesion: fecha,
        respuestas: resultado.detalle,
        aciertos: resultado.aciertos,
        total: resultado.total,
        precision: resultado.precision,
        tiempo_promedio_ms: resultado.tiempo_promedio_ms,
        resultado_por_tema: resultado.resultado_por_tema,
    });
    return { ok: true, resultado };
}
