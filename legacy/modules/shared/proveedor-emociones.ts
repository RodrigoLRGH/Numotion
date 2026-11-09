// Capa de integración desacoplada para detección emocional (RI-06, RC-01).
// La imagen solo existe en memoria durante la llamada: nunca se guarda ni se
// registra en logs (RNF-03, RC-05).
import { EMOCIONES, type Emocion } from "../dominio/emociones";

export interface DeteccionEmocion {
    emocion: Emocion;
    confianza: number; // 0..1
}

export interface ProveedorEmociones {
    nombre: string;
    detectar(imagen: Uint8Array): Promise<DeteccionEmocion>;
}

const simulado: ProveedorEmociones = {
    nombre: "simulado",
    async detectar() {
        // Sesgo hacia emociones neutras/positivas para que la simulación sea realista
        const pesos: [Emocion, number][] = [
            ["CALM", 35], ["HAPPY", 25], ["CONFUSED", 15], ["SURPRISED", 10], ["SAD", 5], ["ANGRY", 5], ["FEAR", 5],
        ];
        let r = Math.random() * 100;
        for (const [emocion, peso] of pesos) {
            if ((r -= peso) <= 0) return { emocion, confianza: +(0.6 + Math.random() * 0.4).toFixed(2) };
        }
        return { emocion: "CALM", confianza: 0.8 };
    },
};

function rekognition(region: string): ProveedorEmociones {
    return {
        nombre: "rekognition",
        async detectar(imagen) {
            const { RekognitionClient, DetectFacesCommand } = await import("@aws-sdk/client-rekognition");
            const cliente = new RekognitionClient({ region });
            const salida = await cliente.send(
                new DetectFacesCommand({ Image: { Bytes: imagen }, Attributes: ["EMOTIONS"] }),
            );
            const emociones = salida.FaceDetails?.[0]?.Emotions ?? [];
            const mejor = [...emociones].sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0))[0];
            const tipo = mejor?.Type as Emocion | undefined;
            if (!tipo || !EMOCIONES.includes(tipo)) return { emocion: "UNKNOWN", confianza: 0 };
            return { emocion: tipo, confianza: +((mejor.Confidence ?? 0) / 100).toFixed(2) };
        },
    };
}

let instancia: ProveedorEmociones | null = null;

export function proveedorEmociones(): ProveedorEmociones {
    if (instancia) return instancia;
    const tipo = import.meta.env.EMOTION_PROVIDER ?? process.env.EMOTION_PROVIDER ?? "simulado";
    const region = import.meta.env.AWS_REGION ?? process.env.AWS_REGION ?? "us-east-1";
    instancia = tipo === "rekognition" ? rekognition(region) : simulado;
    return instancia;
}

// Límite de frecuencia por alumno para controlar costos (RC-04).
const ultimaLlamada = new Map<number, number>();
export const INTERVALO_MIN_DETECCION_MS = 8000;

export function puedeDetectar(idAlumno: number, ahora = Date.now()): boolean {
    const previa = ultimaLlamada.get(idAlumno) ?? 0;
    if (ahora - previa < INTERVALO_MIN_DETECCION_MS) return false;
    ultimaLlamada.set(idAlumno, ahora);
    return true;
}
