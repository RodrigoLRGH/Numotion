// Puntos y nivel de gamificación (RF-03, 02-diseno/02-…§4). Sin puntos negativos.

export const PUNTOS_PRACTICA = 5;
export const NIVEL_GAMIFICACION_MAX = 20;

/** Ejercicio acertado: intento 1 = 10, 2 = 7, 3 = 5; tras la guía (4.º intento o ayuda pedida) = 3. */
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
