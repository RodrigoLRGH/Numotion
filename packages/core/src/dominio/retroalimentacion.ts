// Retroalimentación por alumno (RF-61, RF-62) y resumen grupal (RF-14):
// triangula PANAS-C con el diagnóstico matemático de la sesión.
import { balancePanas, type BalancePanas, type PuntajePanas } from "./panas";
import { temaPorClave } from "./ejercicios";

export type Semaforo = "favorable" | "atencion" | "prioritario";

export interface EntradaRetro {
    panas: PuntajePanas | null;
    precision: number | null; // diagnóstico matemático 0..100
    resultadoPorTema: Record<string, { precision: number }> | null;
}

export interface Retroalimentacion {
    semaforo: Semaforo;
    balance: BalancePanas | null;
    resumen: string;
    temasDebiles: string[];
    recomendaciones: string[];
}

export function generarRetroalimentacion(e: EntradaRetro): Retroalimentacion {
    const balance = e.panas ? balancePanas(e.panas) : null;
    const temasDebiles = Object.entries(e.resultadoPorTema ?? {})
        .filter(([, r]) => r.precision < 50)
        .map(([clave]) => temaPorClave(clave)?.nombre ?? clave);

    const bajoDesempeno = e.precision !== null && e.precision < 50;
    let semaforo: Semaforo = "favorable";
    if (balance === "negativo" && bajoDesempeno) semaforo = "prioritario";
    else if (balance === "negativo" || bajoDesempeno) semaforo = "atencion";

    const recomendaciones: string[] = [];
    if (balance === "negativo") {
        recomendaciones.push("Inicia con una actividad lúdica corta y un saludo personal antes de lo académico.");
    }
    if (temasDebiles.length) {
        recomendaciones.push(`Asigna práctica de refuerzo en: ${temasDebiles.join(", ")} (nivel 1–2).`);
    }
    if (semaforo === "prioritario") {
        recomendaciones.push("Programa un acompañamiento individual durante la sesión.");
    }
    if (!recomendaciones.length) {
        recomendaciones.push("Mantén las asignaciones en su nivel actual; puede avanzar de dificultad.");
    }

    const partes: string[] = [];
    if (balance === null) partes.push("Sin diagnóstico emocional en la sesión.");
    else if (balance === "positivo") partes.push("Inicia la sesión con afecto mayormente positivo.");
    else if (balance === "negativo") partes.push("Inicia la sesión con afecto mayormente negativo.");
    else partes.push("Inicia la sesión con afecto equilibrado.");
    if (e.precision === null) partes.push("Sin diagnóstico matemático en la sesión.");
    else partes.push(`Precisión en el diagnóstico matemático: ${e.precision}%.`);

    return { semaforo, balance, resumen: partes.join(" "), temasDebiles, recomendaciones };
}

export interface ResumenGrupal {
    alumnos: number;
    conDiagnostico: number;
    positivo: number;
    equilibrado: number;
    negativo: number;
    precisionPromedio: number | null;
    prioritarios: number;
}

export function resumenGrupal(retros: readonly (Retroalimentacion & { precision: number | null })[]): ResumenGrupal {
    const conPrecision = retros.filter((r) => r.precision !== null);
    return {
        alumnos: retros.length,
        conDiagnostico: retros.filter((r) => r.balance !== null).length,
        positivo: retros.filter((r) => r.balance === "positivo").length,
        equilibrado: retros.filter((r) => r.balance === "equilibrado").length,
        negativo: retros.filter((r) => r.balance === "negativo").length,
        precisionPromedio: conPrecision.length
            ? Math.round(conPrecision.reduce((s, r) => s + (r.precision ?? 0), 0) / conPrecision.length)
            : null,
        prioritarios: retros.filter((r) => r.semaforo === "prioritario").length,
    };
}
