// Adaptación de dificultad (RF-01, RF-21, RF-57). Rango cerrado 1..5.
import type { BalancePanas } from "./panas";
import { valencia, type Emocion } from "./emociones";

export const NIVEL_MIN = 1;
export const NIVEL_MAX = 5;

export function limitarNivel(nivel: number): number {
    return Math.min(NIVEL_MAX, Math.max(NIVEL_MIN, Math.round(nivel)));
}

/**
 * Nivel inicial de un alumno en un tema (RF-57): parte de la precisión del
 * diagnóstico matemático en ese tema y se suaviza un nivel si el PANAS-C de la
 * sesión muestra balance negativo.
 */
export function nivelInicial(precisionTema: number | null, balance: BalancePanas | null): number {
    let nivel: number;
    if (precisionTema === null) nivel = 2;
    else if (precisionTema >= 90) nivel = 4;
    else if (precisionTema >= 70) nivel = 3;
    else if (precisionTema >= 40) nivel = 2;
    else nivel = 1;
    if (balance === "negativo") nivel -= 1;
    return limitarNivel(nivel);
}

export interface ResultadoReciente {
    es_correcta: boolean;
    numero_intento: number;
}

/**
 * Siguiente nivel tras resolver un ejercicio (RF-21).
 * - Sube 1 si los últimos 3 ejercicios se resolvieron al primer intento y la
 *   emoción reciente no es negativa.
 * - Baja 1 si los últimos 2 terminaron mal, o si hay emoción negativa y el
 *   último fue incorrecto (RF-01: adaptación por estado emocional).
 * `recientes` va del más reciente al más antiguo y contiene el resultado final
 * de cada ejercicio.
 */
export function ajustarNivel(
    nivelActual: number,
    recientes: readonly ResultadoReciente[],
    emocionReciente: Emocion | null,
): number {
    const negativa = valencia(emocionReciente) === "negativa";
    const ultimos3 = recientes.slice(0, 3);
    const ultimos2 = recientes.slice(0, 2);

    if (ultimos2.length === 2 && ultimos2.every((r) => !r.es_correcta)) {
        return limitarNivel(nivelActual - 1);
    }
    if (negativa && recientes[0] && !recientes[0].es_correcta) {
        return limitarNivel(nivelActual - 1);
    }
    if (
        !negativa &&
        ultimos3.length === 3 &&
        ultimos3.every((r) => r.es_correcta && r.numero_intento === 1)
    ) {
        return limitarNivel(nivelActual + 1);
    }
    return limitarNivel(nivelActual);
}
