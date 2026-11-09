// Estado emocional por fotograma y alerta temprana de frustración (RF-16, EXP-05.3, EXP-05.5,
// 02-diseno/02-…§3.1 y §3.3). Funciones puras: el servicio reúne las señales y persiste el resultado.
import type { EstadoEmocional } from "./panas";

export const EMOCIONES_REKOGNITION = ["HAPPY", "CALM", "SURPRISED", "CONFUSED", "SAD", "ANGRY", "FEAR", "DISGUSTED", "UNKNOWN", "SIN_ROSTRO"] as const;
export type EmocionRekognition = (typeof EMOCIONES_REKOGNITION)[number];

export function esEmocionRekognition(v: unknown): v is EmocionRekognition {
    return typeof v === "string" && (EMOCIONES_REKOGNITION as readonly string[]).includes(v);
}

/** Tabla §3.1: emoción dominante + confianza (0–100) → estado derivado del fotograma. */
export function derivarEstado(emocion: EmocionRekognition, confianza: number, confMin = 60): EstadoEmocional {
    if (emocion === "SIN_ROSTRO" || emocion === "UNKNOWN" || confianza < confMin) return "sin_dato";
    if (emocion === "HAPPY" || emocion === "SURPRISED") return "positivo";
    if (emocion === "CALM") return "neutral";
    return "frustracion";
}

/** Proporción E de muestras 'frustracion' entre las que tienen dato; null si no hay ninguna (sin cámara). */
export function fraccionFrustracion(estados: readonly string[]): number | null {
    const conDato = estados.filter((e) => e !== "sin_dato");
    if (conDato.length === 0) return null;
    return conDato.filter((e) => e === "frustracion").length / conDato.length;
}

export interface EntradaAlerta {
    indice: number;
    umbral: number;
    /** Evaluaciones seguidas con IF ≥ umbral antes de esta */
    consecutivosPrevios: number;
    /** Momento de la última alerta del alumno en esta asignación (ms epoch) o null */
    ultimaAlertaMs: number | null;
    ahoraMs: number;
    cooldownMin: number;
}

export interface DecisionAlerta {
    /** Valor a guardar para la próxima evaluación */
    consecutivos: number;
    crear: boolean;
}

/** EXP-05.5: alerta si IF ≥ umbral en 2 evaluaciones consecutivas, con enfriamiento por (alumno, asignación). */
export function evaluarAlerta(e: EntradaAlerta): DecisionAlerta {
    if (e.indice < e.umbral) return { consecutivos: 0, crear: false };
    const consecutivos = e.consecutivosPrevios + 1;
    if (consecutivos < 2) return { consecutivos, crear: false };
    const enfriando = e.ultimaAlertaMs !== null && e.ahoraMs - e.ultimaAlertaMs < e.cooldownMin * 60_000;
    // Al alertar se reinicia el contador: la siguiente alerta exige otras 2 evaluaciones seguidas
    return enfriando ? { consecutivos, crear: false } : { consecutivos: 0, crear: true };
}

/** Errores seguidos al final de la lista de intentos (el más reciente primero). */
export function erroresConsecutivos(intentos: readonly { correcta: boolean }[]): number {
    const i = intentos.findIndex((x) => x.correcta);
    return i === -1 ? intentos.length : i;
}

/** Texto para el docente: señales observadas, nunca diagnósticos (EXP-07, Lenguaje). */
export function describirSenales(s: { estado?: string | null; erroresConsecutivos?: number; inactividadSeg?: number; ayudas?: number; sinCamara?: boolean }): string[] {
    const r: string[] = [];
    if (s.estado === "frustracion") r.push("expresión de frustración en la cámara");
    if (s.estado === "desinteres") r.push("señales de distracción en la cámara");
    if (s.erroresConsecutivos) r.push(`${s.erroresConsecutivos} ${s.erroresConsecutivos === 1 ? "error" : "errores"} seguidos`);
    if (s.inactividadSeg && s.inactividadSeg >= 20) r.push(`${Math.round(s.inactividadSeg)} s sin responder`);
    if (s.ayudas) r.push("pidió ayuda en el ejercicio");
    if (s.sinCamara) r.push("sin cámara (solo desempeño)");
    return r;
}
