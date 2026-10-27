// Catálogo de emociones alineado con AWS Rekognition (DetectFaces → Emotions[].Type)

export const EMOCIONES = [
    "HAPPY",
    "CALM",
    "SURPRISED",
    "CONFUSED",
    "SAD",
    "ANGRY",
    "FEAR",
    "DISGUSTED",
    "UNKNOWN",
] as const;

export type Emocion = (typeof EMOCIONES)[number];
export type Valencia = "positiva" | "neutral" | "negativa";

const VALENCIA: Record<Emocion, Valencia> = {
    HAPPY: "positiva",
    CALM: "positiva",
    SURPRISED: "neutral",
    UNKNOWN: "neutral",
    CONFUSED: "negativa",
    SAD: "negativa",
    ANGRY: "negativa",
    FEAR: "negativa",
    DISGUSTED: "negativa",
};

export const ETIQUETA_EMOCION: Record<Emocion, { texto: string; emoji: string }> = {
    HAPPY: { texto: "Contento", emoji: "😄" },
    CALM: { texto: "Tranquilo", emoji: "😌" },
    SURPRISED: { texto: "Sorprendido", emoji: "😲" },
    CONFUSED: { texto: "Confundido", emoji: "😕" },
    SAD: { texto: "Triste", emoji: "😢" },
    ANGRY: { texto: "Enojado", emoji: "😠" },
    FEAR: { texto: "Nervioso", emoji: "😰" },
    DISGUSTED: { texto: "Disgustado", emoji: "😖" },
    UNKNOWN: { texto: "Sin detectar", emoji: "😶" },
};

export function esEmocion(valor: unknown): valor is Emocion {
    return typeof valor === "string" && (EMOCIONES as readonly string[]).includes(valor);
}

export function valencia(emocion: Emocion | string | null | undefined): Valencia {
    if (!emocion || !esEmocion(emocion)) return "neutral";
    return VALENCIA[emocion];
}

/** Emoción más frecuente de una lista (UNKNOWN si está vacía). */
export function emocionPredominante(emociones: readonly string[]): Emocion {
    const conteo = new Map<Emocion, number>();
    for (const e of emociones) {
        if (!esEmocion(e) || e === "UNKNOWN") continue;
        conteo.set(e, (conteo.get(e) ?? 0) + 1);
    }
    let mejor: Emocion = "UNKNOWN";
    let max = 0;
    for (const [e, n] of conteo) {
        if (n > max) {
            mejor = e;
            max = n;
        }
    }
    return mejor;
}
