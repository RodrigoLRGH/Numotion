// Contenido de las actividades a partir del generador determinista (A-17): qué combinaciones
// (tema, tipo) se pueden servir, cómo se representa cada ejercicio y cómo se clasifica un error.
import type { Rng } from "./aleatorio";
import { tiposDeTema, type TipoInteraccionActividad } from "./catalogo";
import { coincideTolerante } from "./numeros";
import { generarEjercicio, generarIncompleta, type Ejercicio, type Operacion, type TemaGenerador } from "./ejercicios";
import { generarFraccion } from "./fracciones";
import { errorColoreo, evaluarColoreo, generarColorear, generarGeometria, leerColoreo } from "./geometria";
import { normalizarRespuesta } from "./respuesta";

const OPERACIONES = ["suma", "resta", "multiplicacion", "division"] as const;
const esOperacion = (clave: string): clave is Operacion => (OPERACIONES as readonly string[]).includes(clave);

/** Combinaciones (tema, tipo) que el motor sabe servir: todas las del catálogo (A-25, A-30). */
export function combinacionDisponible(temaClave: string, tipo: string): boolean {
    return (tiposDeTema(temaClave) as readonly string[]).includes(tipo);
}

/** Genera un ejercicio de la combinación, o null si no existe en el catálogo. */
export function generarParaActividad(temaClave: string, tipo: TipoInteraccionActividad, nivel: number, rng: Rng): Ejercicio | null {
    if (!combinacionDisponible(temaClave, tipo)) return null;
    const modo = tipo === "arrastrar" ? "arrastrar" : "seleccion_multiple";
    switch (temaClave) {
        case "numeros":
            return tipo === "numero_a_palabras"
                ? generarEjercicio("escritura_numeros", nivel, "texto", rng)
                : generarEjercicio("identificar_numero", nivel, "seleccion_multiple", rng);
        case "geometria":
            return tipo === "colorear_figura" ? generarColorear(nivel, rng) : generarGeometria(nivel, rng);
        case "fracciones":
            return generarFraccion(nivel, modo, rng);
    }
    if (!esOperacion(temaClave)) return null;
    if (tipo === "suma_figuras") return generarEjercicio("suma_figuras", nivel, "numero", rng);
    if (tipo === "completar_operacion") return generarIncompleta(nivel, "seleccion_multiple", rng, temaClave, ["a", "b", "r"]);
    return generarEjercicio(temaClave, nivel, modo, rng);
}

/**
 * Si el navegador puede validar al instante con el hash de la respuesta (EXP-04.8). No para texto
 * libre (tolerancia ortográfica, A-07) ni coloreo (varias respuestas válidas): ahí decide el servidor.
 */
export function validacionLocal(tema: TemaGenerador): boolean {
    return tema !== "escritura_numeros" && tema !== "colorear";
}

export function esCorrecta(e: Pick<Ejercicio, "tema" | "respuesta" | "lienzo">, respuesta: string): boolean {
    if (e.tema === "escritura_numeros") return coincideTolerante(respuesta, e.respuesta).correcta;
    if (e.tema === "colorear") {
        const coloreo = leerColoreo(respuesta);
        return Boolean(e.lienzo && coloreo && evaluarColoreo(e.lienzo, coloreo));
    }
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
    if (e.tema === "colorear") return e.lienzo ? errorColoreo(e.lienzo, leerColoreo(respuesta)) : "otro";
    if (e.tema === "fracciones" && e.respuesta.includes("/")) {
        // Denominador distinto (p. ej. sumó también los denominadores) → procedimiento
        const [, dr] = respuesta.split("/");
        return dr && dr.trim() !== e.respuesta.split("/")[1] ? "procedimiento" : "calculo";
    }
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
