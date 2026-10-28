// Normalización de respuestas compartida por el servidor (evaluación y hash) y el navegador
// (validación optimista, EXP-04.8). Módulo mínimo para no cargar el generador en el cliente.

export function normalizarRespuesta(r: string): string {
    return r.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Texto que se hashea: `${ejercicioId}:${respuesta sin espacios}`. */
export function textoParaHash(ejercicioId: string, respuesta: string): string {
    return `${ejercicioId}:${normalizarRespuesta(respuesta).replace(/ /g, "")}`;
}
