// Diagnóstico matemático escalonado por tema (RF-55, 02-diseno/02-…§3.6).
// Inicia en nivel 1 (las primeras preguntas son sencillas); acierto → sube, fallo → baja; 3 a 5 preguntas por tema. Se hace completo cada
// día (sin versión corta, migración 0015).

export const NIVEL_INICIAL_DIAGNOSTICO = 1;
export const MIN_PREGUNTAS_TEMA = 3;
export const MAX_PREGUNTAS_TEMA = 5;

export interface RespuestaNivel {
    nivel: number;
    correcta: boolean;
}

const acotar = (n: number) => Math.max(1, Math.min(5, n));

/** Nivel de la siguiente pregunta del tema, o null si el tema terminó. */
export function siguienteNivel(historial: readonly RespuestaNivel[]): number | null {
    if (historial.length === 0) return NIVEL_INICIAL_DIAGNOSTICO;
    if (historial.length >= MAX_PREGUNTAS_TEMA) return null;
    const ultima = historial[historial.length - 1];
    const siguiente = acotar(ultima.nivel + (ultima.correcta ? 1 : -1));
    // Con el mínimo cubierto, volver a un nivel ya preguntado no aporta información
    if (historial.length >= MIN_PREGUNTAS_TEMA && historial.some((h) => h.nivel === siguiente)) return null;
    return siguiente;
}

/** Nivel más alto acertado sin haber fallado el inmediato inferior; 1 si no acierta ninguna. */
export function nivelDominio(historial: readonly RespuestaNivel[]): number {
    const fallados = new Set(historial.filter((h) => !h.correcta).map((h) => h.nivel));
    const candidatos = historial.filter((h) => h.correcta && !fallados.has(h.nivel - 1)).map((h) => h.nivel);
    return candidatos.length ? Math.max(...candidatos) : 1;
}
