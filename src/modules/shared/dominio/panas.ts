// PANAS-C (RF-54, RF-61). Los ítems viven en BD (panas_item, versión vigente en
// config_adaptativa.panas_version) y se validan con T-01-03. Escala Likert 1..5;
// AP y AN son el promedio de cada subescala. El alumno nunca ve sus puntajes.

export type Afecto = "positivo" | "negativo";
export type EstadoEmocional = "positivo" | "neutral" | "frustracion" | "desinteres" | "sin_dato";

export const ESCALA_PANAS = [
    { valor: 1, texto: "Nada", icono: "😶" },
    { valor: 2, texto: "Un poco", icono: "🙂" },
    { valor: 3, texto: "Más o menos", icono: "😊" },
    { valor: 4, texto: "Bastante", icono: "😃" },
    { valor: 5, texto: "Muchísimo", icono: "🤩" },
] as const;

export function esValorPanas(valor: unknown): valor is 1 | 2 | 3 | 4 | 5 {
    return Number.isInteger(valor) && (valor as number) >= 1 && (valor as number) <= 5;
}

export interface PuntajeAfecto {
    afectoPositivo: number;
    afectoNegativo: number;
}

export function calcularPanas(respuestas: readonly { afecto: Afecto; valor: number }[]): PuntajeAfecto {
    const prom = (a: number[]) => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 100) / 100;
    return {
        afectoPositivo: prom(respuestas.filter((r) => r.afecto === "positivo").map((r) => r.valor)),
        afectoNegativo: prom(respuestas.filter((r) => r.afecto === "negativo").map((r) => r.valor)),
    };
}

/** 02-diseno/02-…§3.2. Debe coincidir con fn_estado_inicial en BD. */
export function estadoInicialDesdePanas(ap: number, an: number): EstadoEmocional {
    if (an >= 3.0) return "frustracion";
    if (ap >= 3.5 && an < 2.5) return "positivo";
    if (ap < 2.5) return "desinteres";
    return "neutral";
}

// ───────── Heredado (escala de sumas 5..25) ─────────
// Lo usan dificultad, motivación y retroalimentación hasta que EXP-04/06/07 los migren a
// estado_emocional. No usar en código nuevo.
export interface PuntajePanas {
    afecto_positivo: number;
    afecto_negativo: number;
}

export type BalancePanas = "positivo" | "equilibrado" | "negativo";

/** Diferencia de al menos 4 puntos (de 20 posibles) para considerar un balance no equilibrado. */
export function balancePanas(p: PuntajePanas): BalancePanas {
    const diferencia = p.afecto_positivo - p.afecto_negativo;
    if (diferencia >= 4) return "positivo";
    if (diferencia <= -4) return "negativo";
    return "equilibrado";
}
