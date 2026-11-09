// Detección temprana de frustración (RF-16) a partir de señales conductuales y
// emocionales. Regla explicable para que el docente entienda el motivo.
import { valencia } from "./emociones";

export const MAX_INTENTOS_EJERCICIO = 3;

export interface SenalesFrustracion {
    erroresConsecutivos: number;
    intentosEjercicioActual: number;
    /** Emociones detectadas en los últimos 60 s, más reciente primero. */
    emocionesRecientes: readonly string[];
    /** Minutos desde la última alerta en este mismo contexto (null = nunca). */
    minutosDesdeUltimaAlerta: number | null;
}

export interface ResultadoFrustracion {
    alerta: boolean;
    motivo: string | null;
}

export function detectarFrustracion(s: SenalesFrustracion): ResultadoFrustracion {
    if (s.minutosDesdeUltimaAlerta !== null && s.minutosDesdeUltimaAlerta < 5) {
        return { alerta: false, motivo: null };
    }
    const negativas = s.emocionesRecientes.filter((e) => valencia(e) === "negativa").length;
    const emocionNegativa = negativas >= 2 || (s.emocionesRecientes[0] !== undefined && valencia(s.emocionesRecientes[0]) === "negativa");

    if (s.erroresConsecutivos >= 2 && emocionNegativa) {
        return { alerta: true, motivo: `${s.erroresConsecutivos} errores seguidos con emoción negativa detectada` };
    }
    if (s.intentosEjercicioActual >= MAX_INTENTOS_EJERCICIO) {
        return { alerta: true, motivo: `Agotó ${MAX_INTENTOS_EJERCICIO} intentos en un mismo ejercicio` };
    }
    if (s.erroresConsecutivos >= 4) {
        return { alerta: true, motivo: `${s.erroresConsecutivos} errores seguidos` };
    }
    return { alerta: false, motivo: null };
}

/** Guía de actuación para el docente (RF-27). */
export const GUIA_ACTUACION_DOCENTE: readonly string[] = [
    "Acércate al alumno con calma y en voz baja; evita señalarlo frente al grupo.",
    "Valida la emoción: «Veo que este ejercicio está costando trabajo, es normal».",
    "Propón una pausa breve de respiración (3 respiraciones lentas).",
    "Revisa junto con el alumno la solución guiada del ejercicio.",
    "Ofrece un ejercicio más sencillo o un cambio de actividad lúdica.",
    "Registra una nota rápida con lo observado para darle seguimiento.",
];

/** Guía de calma que se ofrece al alumno; él decide si la quiere (RF-27). */
export const GUIA_CALMA_ALUMNO: readonly string[] = [
    "Respira hondo por la nariz contando hasta 4 🌬️",
    "Suelta el aire despacito por la boca contando hasta 4 😮‍💨",
    "Repite 3 veces. ¡Muy bien!",
    "Recuerda: equivocarse es parte de aprender 💪",
    "Si quieres, mira la solución paso a paso del ejercicio 👀",
];
