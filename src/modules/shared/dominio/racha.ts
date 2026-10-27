// Cálculo de racha (RF-67) y mejor racha (RF-68).
// La racha cuenta días hábiles consecutivos con al menos una actividad lúdica
// de práctica libre completada. Sábados y domingos no la interrumpen.
import { diaHabilAnterior, ultimoDiaHabilHasta } from "./fechas";

export interface EstadoRacha {
    racha_actual: number;
    mejor_racha: number;
    /** Último día (YYYY-MM-DD) en que sumó racha. */
    ultima_fecha_racha: string | null;
}

/**
 * Racha vigente al día `hoy`: si terminó un día hábil sin actividad desde la
 * última fecha registrada, la racha visible es 0.
 */
export function rachaVigente(estado: EstadoRacha, hoy: string): number {
    if (!estado.ultima_fecha_racha) return 0;
    const ultima = estado.ultima_fecha_racha;
    if (ultima >= ultimoDiaHabilHasta(hoy)) return estado.racha_actual;
    // Hoy aún no termina: si la última fue el día hábil anterior a hoy, sigue viva.
    if (ultima >= diaHabilAnterior(hoy)) return estado.racha_actual;
    return 0;
}

/** Aplica la compleción de una actividad lúdica en `hoy`. */
export function registrarActividadLudica(estado: EstadoRacha, hoy: string): EstadoRacha {
    if (estado.ultima_fecha_racha === hoy) return estado; // ya sumó hoy
    const vigente = rachaVigente(estado, hoy);
    const nueva = vigente + 1;
    return {
        racha_actual: nueva,
        mejor_racha: Math.max(estado.mejor_racha, nueva),
        ultima_fecha_racha: hoy,
    };
}
