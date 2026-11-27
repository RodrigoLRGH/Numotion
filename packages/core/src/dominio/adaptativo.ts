// Motor adaptativo por reglas deterministas (ADR-005, 02-diseno/02-…§3). Funciones puras:
// el servicio reúne las señales y registra cada cambio en ajuste_dificultad.
import type { EstadoEmocional } from "./panas";

export type MotivoAjuste = "desempeno" | "emocion" | "combinado" | "solicitud_ayuda" | "inicial";

export interface EjercicioCerrado {
    correctoPrimerIntento: boolean;
    correcto: boolean;
    tiempoMs: number;
}

export interface EntradaAdaptativa {
    nivelActual: number;
    /** Últimos ejercicios cerrados de la asignación, el más reciente primero (máx. 3) */
    ultimos3: readonly EjercicioCerrado[];
    tiempoReferenciaMs: number;
    estadoVentana: EstadoEmocional;
    indiceFrustracion: number;
    erroresConsecutivos: number;
    ejerciciosDesdeUltimoCambio: number;
    umbralAlerta?: number;
}

export interface DecisionNivel {
    nivelNuevo: number;
    motivo: MotivoAjuste | null;
    reglas: string[];
}

const acotar = (n: number) => Math.max(1, Math.min(5, n));

function mediana(v: number[]): number {
    const s = [...v].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Tabla 02-…§3.4, en orden. R3–R5 exigen 3 ejercicios cerrados (A-26). R2 (bajar al aceptar ayuda)
 *  se retiró junto con las alertas (migración 0015). */
export function decidirNivel(e: EntradaAdaptativa): DecisionNivel {
    const umbral = e.umbralAlerta ?? 0.6;
    const cambiar = (delta: number, motivo: MotivoAjuste, regla: string): DecisionNivel => {
        const nivelNuevo = acotar(e.nivelActual + delta);
        return { nivelNuevo, motivo: nivelNuevo === e.nivelActual ? null : motivo, reglas: [regla] };
    };

    if (e.indiceFrustracion >= umbral || (e.estadoVentana === "frustracion" && e.erroresConsecutivos >= 2)) {
        return cambiar(-1, e.erroresConsecutivos >= 2 ? "combinado" : "emocion", "R1");
    }
    if (e.ejerciciosDesdeUltimoCambio < 2) return { nivelNuevo: e.nivelActual, motivo: null, reglas: ["R0"] };
    if (e.ultimos3.length < 3) return { nivelNuevo: e.nivelActual, motivo: null, reglas: [] };

    const correctos = e.ultimos3.filter((x) => x.correcto).length;
    if (correctos <= 1) return cambiar(-1, "desempeno", "R3");
    if (
        e.ultimos3.every((x) => x.correctoPrimerIntento) &&
        mediana(e.ultimos3.map((x) => x.tiempoMs)) <= 1.2 * e.tiempoReferenciaMs &&
        e.estadoVentana !== "frustracion"
    ) {
        return cambiar(+1, e.estadoVentana === "desinteres" ? "combinado" : "desempeno", "R4");
    }
    if (e.estadoVentana === "desinteres" && correctos >= 2) return cambiar(+1, "emocion", "R5");
    return { nivelNuevo: e.nivelActual, motivo: null, reglas: [] };
}

export interface SenalesFrustracion {
    /** Proporción de muestras 'frustracion' entre las muestras con dato; null sin cámara o sin datos */
    fraccionFrustracion: number | null;
    erroresConsecutivos: number;
    inactividadSeg: number;
    ayudasEnEjercicio: number;
}

/** Índice de Frustración 0..1 (§3.3). Sin cámara se omite E y se renormalizan los pesos. */
export function indiceFrustracion(s: SenalesFrustracion): number {
    const errores = Math.min(s.erroresConsecutivos / 3, 1);
    const inactividad = Math.min(s.inactividadSeg / 60, 1);
    const ayudas = Math.min(s.ayudasEnEjercicio / 2, 1);
    const valor =
        s.fraccionFrustracion === null
            ? 0.5 * errores + 0.33 * inactividad + 0.17 * ayudas
            : 0.4 * Math.min(Math.max(s.fraccionFrustracion, 0), 1) + 0.3 * errores + 0.2 * inactividad + 0.1 * ayudas;
    return Math.round(valor * 100) / 100;
}

// Del más negativo al más positivo: desempata la moda (§3.1)
const NEGATIVIDAD: EstadoEmocional[] = ["frustracion", "desinteres", "neutral", "positivo"];

/** Estado de la ventana a partir de las muestras (la más reciente primero). */
export function estadoVentana(muestras: readonly { estado: string; emocion: string }[], inactividadSeg: number, inactividadUmbralSeg = 45): EstadoEmocional {
    const conDato = muestras.filter((m) => m.estado !== "sin_dato");
    const sinRostroSeguidos = muestras.slice(0, 3).length === 3 && muestras.slice(0, 3).every((m) => m.emocion === "SIN_ROSTRO");
    if (conDato.length < 2 && !sinRostroSeguidos) return "sin_dato";

    const neutrales = conDato.filter((m) => m.estado === "neutral").length;
    if (conDato.length >= 2 && neutrales / conDato.length >= 0.8 && (inactividadSeg > inactividadUmbralSeg || sinRostroSeguidos)) return "desinteres";
    if (sinRostroSeguidos && (conDato.length === 0 || neutrales / conDato.length >= 0.8)) return "desinteres";
    if (conDato.length < 2) return "sin_dato";

    const conteo = new Map<string, number>();
    for (const m of conDato) conteo.set(m.estado, (conteo.get(m.estado) ?? 0) + 1);
    const max = Math.max(...conteo.values());
    return NEGATIVIDAD.find((e) => conteo.get(e) === max) ?? "neutral";
}
