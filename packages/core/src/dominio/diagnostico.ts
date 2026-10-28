// Diagnóstico matemático escalonado por tema (RF-55, 02-diseno/02-…§3.6, EXP-02.6).
// Inicia en nivel 2; acierto → sube, fallo → baja; 3 a 5 preguntas por tema.

export const NIVEL_INICIAL_DIAGNOSTICO = 2;
export const MIN_PREGUNTAS_TEMA = 3;
export const MAX_PREGUNTAS_TEMA = 5;

export interface RespuestaNivel {
    nivel: number;
    correcta: boolean;
}

/** Completo: escalonado. Corto: 1 pregunta en el último nivel de dominio (diagnóstico reciente). */
export type Modo = { tipo: "completo" } | { tipo: "corto"; nivel: number };

const acotar = (n: number) => Math.max(1, Math.min(5, n));

/** Nivel de la siguiente pregunta del tema, o null si el tema terminó. */
export function siguienteNivel(historial: readonly RespuestaNivel[], modo: Modo): number | null {
    if (modo.tipo === "corto") return historial.length === 0 ? acotar(modo.nivel) : null;
    if (historial.length === 0) return NIVEL_INICIAL_DIAGNOSTICO;
    if (historial.length >= MAX_PREGUNTAS_TEMA) return null;
    const ultima = historial[historial.length - 1];
    const siguiente = acotar(ultima.nivel + (ultima.correcta ? 1 : -1));
    // Con el mínimo cubierto, volver a un nivel ya preguntado no aporta información
    if (historial.length >= MIN_PREGUNTAS_TEMA && historial.some((h) => h.nivel === siguiente)) return null;
    return siguiente;
}

/** Nivel más alto acertado sin haber fallado el inmediato inferior; 1 si no acierta ninguna. */
export function nivelDominio(historial: readonly RespuestaNivel[], modo: Modo): number {
    if (modo.tipo === "corto") {
        const r = historial[0];
        return r ? acotar(r.correcta ? r.nivel : r.nivel - 1) : acotar(modo.nivel);
    }
    const fallados = new Set(historial.filter((h) => !h.correcta).map((h) => h.nivel));
    const candidatos = historial.filter((h) => h.correcta && !fallados.has(h.nivel - 1)).map((h) => h.nivel);
    return candidatos.length ? Math.max(...candidatos) : 1;
}
