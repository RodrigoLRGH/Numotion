// EmotionGateway (RI-06, RC-01, EXP-05.2): capa desacoplada de detección emocional.
// La imagen solo existe en memoria durante la llamada: nunca llega a disco, S3, BD ni logs
// (RNF-03, RC-05) y el buffer se sobrescribe con ceros al terminar. Errores o timeout (3 s):
// la muestra se ignora y la actividad sigue.
//
// EMOTION_PROVIDER: rekognition | simulado | desactivado
//   (por defecto: simulado en desarrollo, desactivado en producción hasta configurarlo).
import type { EmocionRekognition } from "@numotion/core/dominio/alertas";
import { esProduccion } from "./entorno";

export interface Lectura {
    emocion: EmocionRekognition;
    /** 0–100 */
    confianza: number;
}

export interface EmotionGateway {
    nombre: "rekognition" | "simulado";
    detectar(imagen: Uint8Array): Promise<Lectura | null>;
}

export const TIMEOUT_MS = 3000;

/** Emoción dominante del rostro más grande (el alumno frente a su dispositivo, RC-03). */
export function lecturaDeRespuesta(caras: { BoundingBox?: { Width?: number }; Emotions?: { Type?: string; Confidence?: number }[] }[] | undefined): Lectura {
    const cara = [...(caras ?? [])].sort((a, b) => (b.BoundingBox?.Width ?? 0) - (a.BoundingBox?.Width ?? 0))[0];
    if (!cara) return { emocion: "SIN_ROSTRO", confianza: 0 };
    const top = [...(cara.Emotions ?? [])].sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0))[0];
    const tipo = top?.Type as EmocionRekognition | undefined;
    const validas: EmocionRekognition[] = ["HAPPY", "CALM", "SURPRISED", "CONFUSED", "SAD", "ANGRY", "FEAR", "DISGUSTED"];
    if (!tipo || !validas.includes(tipo)) return { emocion: "UNKNOWN", confianza: Math.round(top?.Confidence ?? 0) };
    return { emocion: tipo, confianza: Math.round((top?.Confidence ?? 0) * 100) / 100 };
}

function rekognition(region: string): EmotionGateway {
    let cliente: import("@aws-sdk/client-rekognition").RekognitionClient | null = null;
    return {
        nombre: "rekognition",
        async detectar(imagen) {
            const { RekognitionClient, DetectFacesCommand } = await import("@aws-sdk/client-rekognition");
            // Credenciales por la cadena estándar del SDK (rol IAM en AWS, variables en local)
            cliente ??= new RekognitionClient({ region, maxAttempts: 1 });
            const control = new AbortController();
            const t = setTimeout(() => control.abort(), TIMEOUT_MS);
            try {
                const salida = await cliente.send(new DetectFacesCommand({ Image: { Bytes: imagen }, Attributes: ["EMOTIONS"] }), { abortSignal: control.signal });
                return lecturaDeRespuesta(salida.FaceDetails);
            } catch {
                return null; // nunca se registra el contenido ni el error con datos de la imagen
            } finally {
                clearTimeout(t);
            }
        },
    };
}

/** Para desarrollo y pruebas sin AWS: sesgado a neutro/positivo, determinista por tamaño del fotograma. */
export const simulado: EmotionGateway = {
    nombre: "simulado",
    async detectar(imagen) {
        const pesos: [EmocionRekognition, number][] = [["CALM", 40], ["HAPPY", 25], ["CONFUSED", 15], ["SURPRISED", 8], ["SAD", 6], ["ANGRY", 6]];
        let x = (imagen.length * 2654435761) % 100;
        for (const [emocion, peso] of pesos) {
            if ((x -= peso) < 0) return { emocion, confianza: 70 + (imagen.length % 30) };
        }
        return { emocion: "CALM", confianza: 80 };
    },
};

let instancia: EmotionGateway | null | undefined;
let forzado: EmotionGateway | null | undefined;

/** Proveedor configurado, o null si la detección está desactivada. */
export function emotionGateway(): EmotionGateway | null {
    if (forzado !== undefined) return forzado;
    if (instancia !== undefined) return instancia;
    const tipo = process.env.EMOTION_PROVIDER ?? (esProduccion() ? "desactivado" : "simulado");
    instancia = tipo === "rekognition" ? rekognition(process.env.AWS_REGION ?? "us-east-1") : tipo === "simulado" ? simulado : null;
    return instancia;
}

/** Solo pruebas: sustituye el proveedor (undefined restaura el configurado). */
export function usarGatewayEmociones(g: EmotionGateway | null | undefined): void {
    forzado = g;
}

/** Detecta y descarta: el buffer se sobrescribe con ceros pase lo que pase. */
export async function detectarYDescartar(g: EmotionGateway, imagen: Uint8Array): Promise<Lectura | null> {
    try {
        return await g.detectar(imagen);
    } catch {
        return null;
    } finally {
        imagen.fill(0);
    }
}

// Métrica rekognition_calls_total del proceso (se expone en logs agregados, sin datos del alumno)
let llamadas = 0;
export const metricas = {
    sumar: () => void llamadas++,
    total: () => llamadas,
};
