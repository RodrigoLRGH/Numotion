// Puntos y nivel de gamificación (RF-03, 02-diseno/02-…§4). Sin puntos negativos.

/**
 * Práctica libre (RF-03): puntos por cada respuesta correcta según el intento (1.º = 3, 2.º = 2,
 * 3.º = 1). Escala menor que la de las actividades asignadas porque la práctica es ilimitada.
 */
export const PUNTOS_ACIERTO_PRACTICA = [3, 2, 1] as const;

export function puntosAciertoPractica(correcta: boolean, numeroIntento: number): number {
    if (!correcta) return 0;
    return PUNTOS_ACIERTO_PRACTICA[numeroIntento - 1] ?? 1;
}
export const NIVEL_GAMIFICACION_MAX = 20;

/** Ejercicio acertado: intento 1 = 10, 2 = 7, 3 = 5; tras pedir la guía = 3 (máximo 3 intentos, RF-11). */
export function puntosPorEjercicio(correcta: boolean, numeroIntento: number, conGuia: boolean): number {
    if (!correcta) return 0;
    if (conGuia || numeroIntento >= 4) return 3;
    return [10, 7, 5][numeroIntento - 1] ?? 3;
}

/** El nivel n requiere 50·n·(n−1) puntos. */
export function nivelGamificacion(puntos: number): number {
    let n = 1;
    while (n < NIVEL_GAMIFICACION_MAX && 50 * (n + 1) * n <= puntos) n++;
    return n;
}

export function puntosParaNivel(n: number): number {
    return 50 * n * (n - 1);
}

/** Estrellas de la recompensa según el resultado final 0–10 (A-27). */
export function estrellas(resultado: number): 1 | 2 | 3 {
    return resultado >= 9 ? 3 : resultado >= 7 ? 2 : 1;
}
