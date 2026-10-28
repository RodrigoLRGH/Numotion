// Contenido de las actividades a partir del generador determinista (A-17): qué combinaciones
// (tema, tipo) se pueden servir, cómo se representa cada ejercicio y cómo se clasifica un error.
import type { Rng } from "./aleatorio";
import type { TipoInteraccionActividad } from "./catalogo";
import { coincideTolerante } from "./numeros";
import { generarEjercicio, generarIncompleta, type Ejercicio, type Operacion } from "./ejercicios";
import { normalizarRespuesta } from "./respuesta";

const OPERACIONES = ["suma", "resta", "multiplicacion", "division"] as const;
const esOperacion = (clave: string): clave is Operacion => (OPERACIONES as readonly string[]).includes(clave);

/**
 * Combinaciones que el motor ya sabe servir (primera entrega de EXP-04). El catálogo de la API solo
 * ofrece estas al docente; el resto (A-25) llega con sus componentes y contenido.
 */
export function combinacionDisponible(temaClave: string, tipo: string): boolean {
    if (esOperacion(temaClave)) return tipo === "seleccion_multiple" || tipo === "arrastrar" || tipo === "completar_operacion";
    if (temaClave === "numeros") return tipo === "identificar_numero" || tipo === "seleccion_multiple";
    return false;
}

/** Genera un ejercicio de la combinación, o null si aún no hay contenido para ella. */
export function generarParaActividad(temaClave: string, tipo: TipoInteraccionActividad, nivel: number, rng: Rng): Ejercicio | null {
    if (!combinacionDisponible(temaClave, tipo)) return null;
    if (temaClave === "numeros") return generarEjercicio("identificar_numero", nivel, "seleccion_multiple", rng);
    if (!esOperacion(temaClave)) return null;
    if (tipo === "completar_operacion") return generarIncompleta(nivel, "seleccion_multiple", rng, temaClave, ["a", "b", "r"]);
    return generarEjercicio(temaClave, nivel, tipo === "arrastrar" ? "arrastrar" : "seleccion_multiple", rng);
}

export function esCorrecta(e: Pick<Ejercicio, "tema" | "respuesta">, respuesta: string): boolean {
    if (e.tema === "escritura_numeros") return coincideTolerante(respuesta, e.respuesta).correcta;
    return normalizarRespuesta(respuesta).replace(/ /g, "") === normalizarRespuesta(e.respuesta).replace(/ /g, "");
}

export type TipoError = "calculo" | "procedimiento" | "lectura" | "ortografia" | "seleccion" | "tiempo_agotado" | "otro";

const OPERAR: Record<Operacion, (a: number, b: number) => number> = {
    suma: (a, b) => a + b,
    resta: (a, b) => a - b,
    multiplicacion: (a, b) => a * b,
    division: (a, b) => (b === 0 ? NaN : a / b),
};

/** Clasificación de tipo_error (RF-19, tabla de EXP-04). */
export function clasificarError(e: Ejercicio, respuesta: string): TipoError {
    if (e.tema === "escritura_numeros") return coincideTolerante(respuesta, e.respuesta).correcta ? "ortografia" : "lectura";
    if (e.tema === "identificar_numero") return "lectura";
    const n = Number(respuesta);
    const esperado = Number(e.respuesta);
    if (!Number.isFinite(n)) return "otro";
    if (e.tema === "suma_figuras") return Math.abs(n - esperado) === 1 ? "calculo" : "otro";
    const { a, b, operacion } = e.datos;
    // Resultado de otra operación con los mismos números (p. ej. sumó en vez de restar)
    if (a !== undefined && b !== undefined && operacion && e.datos.oculto === "r") {
        const otras = OPERACIONES.filter((o) => o !== operacion).map((o) => OPERAR[o](a, b));
        if (otras.includes(n)) return "procedimiento";
    }
    const d = Math.abs(n - esperado);
    if (d === 1 || d === 10) return "calculo";
    return "seleccion";
}
