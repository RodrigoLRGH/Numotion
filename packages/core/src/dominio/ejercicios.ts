// Catálogo de temas y generación procedural de ejercicios por nivel 1..5
// (RF-03, RF-10, RF-39..RF-42) con solución guiada paso a paso (RF-11, RF-45).
import { barajar, crearRng, elegir, entero, type Rng } from "./aleatorio";
import { limitarNivel } from "./dificultad";
import { coincideTolerante, distanciaEdicion, normalizarTexto, numeroAPalabras } from "./numeros";

export type TipoInteraccion = "seleccion_multiple" | "arrastrar" | "texto" | "numero";
export type InteraccionAsignable = "seleccion_multiple" | "arrastrar";
export type Operacion = "suma" | "resta" | "multiplicacion" | "division";

export type ClaveTema =
    | "suma"
    | "resta"
    | "multiplicacion"
    | "division"
    | "operaciones_incompletas"
    | "escritura_numeros"
    | "identificar_numero"
    | "suma_figuras";

export interface DefinicionTema {
    clave: ClaveTema;
    nombre: string;
    area: string;
    descripcion: string;
    emoji: string;
    /** academico: asignable por el docente; ludico: práctica libre (cuenta para racha). */
    tipo: "academico" | "ludico";
    interacciones: readonly TipoInteraccion[];
}

export const TEMAS: readonly DefinicionTema[] = [
    { clave: "suma", nombre: "Suma", area: "Operaciones básicas", descripcion: "Sumar números naturales", emoji: "➕", tipo: "academico", interacciones: ["seleccion_multiple", "arrastrar"] },
    { clave: "resta", nombre: "Resta", area: "Operaciones básicas", descripcion: "Restar números naturales", emoji: "➖", tipo: "academico", interacciones: ["seleccion_multiple", "arrastrar"] },
    { clave: "multiplicacion", nombre: "Multiplicación", area: "Operaciones básicas", descripcion: "Tablas y productos", emoji: "✖️", tipo: "academico", interacciones: ["seleccion_multiple", "arrastrar"] },
    { clave: "division", nombre: "División", area: "Operaciones básicas", descripcion: "Divisiones exactas", emoji: "➗", tipo: "academico", interacciones: ["seleccion_multiple", "arrastrar"] },
    { clave: "operaciones_incompletas", nombre: "Operaciones incompletas", area: "Operaciones básicas", descripcion: "Encuentra el número que falta", emoji: "🧩", tipo: "academico", interacciones: ["seleccion_multiple", "arrastrar"] },
    { clave: "escritura_numeros", nombre: "Escribe el número", area: "Números", descripcion: "Escribe con palabras el número que ves", emoji: "✍️", tipo: "ludico", interacciones: ["texto"] },
    { clave: "identificar_numero", nombre: "Encuentra el número", area: "Números", descripcion: "Toca el número que se te pide", emoji: "🔎", tipo: "ludico", interacciones: ["seleccion_multiple"] },
    { clave: "suma_figuras", nombre: "Suma con figuras", area: "Operaciones básicas", descripcion: "Cuenta las figuras y escribe el total", emoji: "🍎", tipo: "ludico", interacciones: ["numero"] },
];

export function temaPorClave(clave: string): DefinicionTema | undefined {
    return TEMAS.find((t) => t.clave === clave);
}

/** Generador que produjo el ejercicio: los de TEMAS más los del contenido provisional (A-30). */
export type TemaGenerador = ClaveTema | "colorear" | "geometria" | "fracciones";

/** Lienzo de "colorea la figura" (RF-44): figuras con id y la instrucción (forma + color). */
export interface Lienzo {
    figuras: readonly { id: string; tipo: string }[];
    instruccion: { tipo: string; color: string };
}

export interface Ejercicio {
    tema: TemaGenerador;
    nivel: number;
    interaccion: TipoInteraccion;
    enunciado: string;
    /** Expresión con hueco (□) para arrastrar y operaciones incompletas. */
    expresion?: string;
    opciones?: string[];
    figuras?: { emoji: string; cantidad: number }[];
    /** Número mostrado en ejercicios de escritura. */
    numeroMostrado?: number;
    lienzo?: Lienzo;
    respuesta: string;
    pasos: string[];
    datos: { a?: number; b?: number; operacion?: Operacion; oculto?: "a" | "b" | "r" };
}

/** Lo que se envía al navegador: sin respuesta ni pasos (se validan en servidor). */
export type EjercicioPublico = Omit<Ejercicio, "respuesta" | "pasos" | "datos">;

export function aPublico(e: Ejercicio): EjercicioPublico {
    const { respuesta: _r, pasos: _p, datos: _d, ...publico } = e;
    return publico;
}

const SIMBOLO: Record<Operacion, string> = { suma: "+", resta: "−", multiplicacion: "×", division: "÷" };
const POSICIONES = ["unidades", "decenas", "centenas", "unidades de millar", "decenas de millar"];

function digitos(n: number): number[] {
    return String(n).split("").reverse().map(Number);
}

function operar(op: Operacion, a: number, b: number): number {
    switch (op) {
        case "suma": return a + b;
        case "resta": return a - b;
        case "multiplicacion": return a * b;
        case "division": return a / b;
    }
}

// ---------- Operandos por nivel ----------

function operandos(op: Operacion, nivel: number, rng: Rng): [number, number] {
    const n = limitarNivel(nivel);
    switch (op) {
        case "suma": {
            const rangos: [number, number, number, number][] = [
                [1, 9, 1, 9], [10, 49, 1, 9], [10, 99, 10, 99], [100, 999, 10, 99], [100, 999, 100, 999],
            ];
            const [a1, a2, b1, b2] = rangos[n - 1];
            return [entero(rng, a1, a2), entero(rng, b1, b2)];
        }
        case "resta": {
            const rangos: [number, number, number, number][] = [
                [5, 10, 1, 5], [10, 50, 1, 9], [20, 99, 10, 50], [100, 999, 10, 99], [300, 999, 100, 299],
            ];
            const [a1, a2, b1, b2] = rangos[n - 1];
            const a = entero(rng, a1, a2);
            return [a, Math.min(a, entero(rng, b1, b2))];
        }
        case "multiplicacion": {
            const rangos: [number, number, number, number][] = [
                [1, 5, 1, 5], [2, 10, 2, 10], [11, 20, 2, 9], [21, 99, 2, 9], [11, 99, 11, 30],
            ];
            const [a1, a2, b1, b2] = rangos[n - 1];
            return [entero(rng, a1, a2), entero(rng, b1, b2)];
        }
        case "division": {
            // Divisiones exactas: dividendo = divisor × cociente
            const rangos: [number, number, number, number][] = [
                [2, 5, 1, 5], [2, 10, 2, 10], [2, 9, 11, 20], [2, 9, 21, 99], [11, 25, 11, 40],
            ];
            const [d1, d2, q1, q2] = rangos[n - 1];
            const d = entero(rng, d1, d2);
            const q = entero(rng, q1, q2);
            return [d * q, d];
        }
    }
}

// ---------- Distractores ----------

function distractoresNumericos(correcta: number, rng: Rng, extra: number[] = []): number[] {
    const magnitud = correcta >= 100 ? 10 : 1;
    const candidatos = [...extra, correcta + 1, correcta - 1, correcta + 2, correcta - 2, correcta + magnitud * 10, correcta - magnitud * 10, correcta + 10, correcta - 10];
    const unicos = [...new Set(candidatos)].filter((c) => c >= 0 && c !== correcta);
    return barajar(rng, unicos).slice(0, 3);
}

export function opcionesCon(correcta: number, rng: Rng, extra: number[] = []): string[] {
    return barajar(rng, [correcta, ...distractoresNumericos(correcta, rng, extra)]).map(String);
}

/** Suma dígito a dígito sin acarreo: error típico (para distractor y clasificación). */
function sumaSinAcarreo(a: number, b: number): number {
    const da = digitos(a);
    const db = digitos(b);
    const largo = Math.max(da.length, db.length);
    let r = "";
    for (let i = 0; i < largo; i++) r = String(((da[i] ?? 0) + (db[i] ?? 0)) % 10) + r;
    return Number(r);
}

/** Resta dígito a dígito restando el menor del mayor (error de préstamo). */
function restaSinPrestamo(a: number, b: number): number {
    const da = digitos(a);
    const db = digitos(b);
    let r = "";
    for (let i = 0; i < da.length; i++) r = String(Math.abs(da[i] - (db[i] ?? 0))) + r;
    return Number(r);
}

// ---------- Pasos guiados ----------

function pasosSuma(a: number, b: number): string[] {
    const pasos = [`Acomoda ${a} y ${b} en columnas, alineando las unidades.`];
    const da = digitos(a);
    const db = digitos(b);
    const largo = Math.max(da.length, db.length);
    if (largo === 1) {
        pasos.push(`Cuenta ${b} lugares a partir de ${a}: ${a} + ${b} = ${a + b}.`);
    } else {
        let lleva = 0;
        for (let i = 0; i < largo; i++) {
            const x = da[i] ?? 0;
            const y = db[i] ?? 0;
            const s = x + y + lleva;
            const textoLleva = lleva ? ` + ${lleva} que llevabas` : "";
            const ultimo = i === largo - 1;
            if (s >= 10 && !ultimo) {
                pasos.push(`Suma las ${POSICIONES[i]}: ${x} + ${y}${textoLleva} = ${s}. Escribe ${s % 10} y lleva 1.`);
                lleva = 1;
            } else {
                pasos.push(`Suma las ${POSICIONES[i]}: ${x} + ${y}${textoLleva} = ${s}. Escribe ${s}.`);
                lleva = 0;
            }
        }
    }
    pasos.push(`Resultado: ${a} + ${b} = ${a + b}.`);
    return pasos;
}

function pasosResta(a: number, b: number): string[] {
    const pasos = [`Acomoda ${a} arriba y ${b} abajo, alineando las unidades.`];
    const da = digitos(a);
    const db = digitos(b);
    if (da.length === 1) {
        pasos.push(`Quita ${b} a ${a}: cuenta hacia atrás ${b} lugares desde ${a} y llegas a ${a - b}.`);
    } else {
        let presta = 0;
        for (let i = 0; i < da.length; i++) {
            let x = da[i] - presta;
            const y = db[i] ?? 0;
            if (x < y) {
                pasos.push(`En las ${POSICIONES[i]}, ${x} es menor que ${y}: pide prestado 1 a la siguiente columna y ahora tienes ${x + 10}. ${x + 10} − ${y} = ${x + 10 - y}.`);
                x += 10;
                presta = 1;
            } else {
                pasos.push(`Resta las ${POSICIONES[i]}: ${x} − ${y} = ${x - y}.`);
                presta = 0;
            }
        }
    }
    pasos.push(`Resultado: ${a} − ${b} = ${a - b}.`);
    return pasos;
}

function pasosMultiplicacion(a: number, b: number): string[] {
    const r = a * b;
    if (a <= 10 && b <= 5) {
        return [
            `Multiplicar ${a} × ${b} es sumar ${b} veces el ${a}.`,
            `${Array(b).fill(a).join(" + ")} = ${r}.`,
            `Resultado: ${a} × ${b} = ${r}.`,
        ];
    }
    if (a <= 10 && b <= 10) {
        return [`Usa la tabla del ${a}.`, `${a} × ${b} = ${r}.`, `Resultado: ${a} × ${b} = ${r}.`];
    }
    const decenas = Math.floor(a / 10) * 10;
    const unidades = a % 10;
    if (b < 10) {
        return [
            `Descompón ${a} en ${decenas} + ${unidades}.`,
            `Multiplica las decenas: ${decenas} × ${b} = ${decenas * b}.`,
            `Multiplica las unidades: ${unidades} × ${b} = ${unidades * b}.`,
            `Suma los resultados: ${decenas * b} + ${unidades * b} = ${r}.`,
            `Resultado: ${a} × ${b} = ${r}.`,
        ];
    }
    const bd = Math.floor(b / 10) * 10;
    const bu = b % 10;
    return [
        `Descompón ${b} en ${bd} + ${bu}.`,
        `Multiplica ${a} × ${bd} = ${a * bd}.`,
        `Multiplica ${a} × ${bu} = ${a * bu}.`,
        `Suma los resultados: ${a * bd} + ${a * bu} = ${r}.`,
        `Resultado: ${a} × ${b} = ${r}.`,
    ];
}

function pasosDivision(a: number, b: number): string[] {
    const q = a / b;
    return [
        `Dividir ${a} ÷ ${b} es buscar qué número multiplicado por ${b} da ${a}.`,
        `Prueba con la tabla del ${b}: ${b} × ${q} = ${a}.`,
        `Comprueba: ${q} grupos de ${b} forman ${a}.`,
        `Resultado: ${a} ÷ ${b} = ${q}.`,
    ];
}

function pasosOperacion(op: Operacion, a: number, b: number): string[] {
    switch (op) {
        case "suma": return pasosSuma(a, b);
        case "resta": return pasosResta(a, b);
        case "multiplicacion": return pasosMultiplicacion(a, b);
        case "division": return pasosDivision(a, b);
    }
}

// ---------- Generadores ----------

function generarOperacion(op: Operacion, nivel: number, interaccion: InteraccionAsignable, rng: Rng): Ejercicio {
    const [a, b] = operandos(op, nivel, rng);
    const r = operar(op, a, b);
    const extra = op === "suma" ? [sumaSinAcarreo(a, b), a > b ? a - b : -1] : op === "resta" ? [restaSinPrestamo(a, b), a + b] : [];
    const expr = `${a} ${SIMBOLO[op]} ${b}`;
    return {
        tema: op,
        nivel,
        interaccion,
        enunciado: interaccion === "arrastrar" ? "Arrastra el resultado correcto al recuadro" : `¿Cuánto es ${expr}?`,
        expresion: interaccion === "arrastrar" ? `${expr} = □` : undefined,
        opciones: opcionesCon(r, rng, extra.filter((x) => x !== r)),
        respuesta: String(r),
        pasos: pasosOperacion(op, a, b),
        datos: { a, b, operacion: op, oculto: "r" },
    };
}

/**
 * Operación con un número faltante (RF-42). Sin `op` elige la operación al azar; `posiciones`
 * indica dónde puede ir el hueco (por defecto en un operando; "r" = el resultado).
 */
export function generarIncompleta(
    nivel: number,
    interaccion: InteraccionAsignable,
    rng: Rng,
    op: Operacion = elegir<Operacion>(rng, ["suma", "resta", "multiplicacion", "division"]),
    posiciones: readonly ("a" | "b" | "r")[] = ["a", "b"],
): Ejercicio {
    const [a, b] = operandos(op, Math.max(1, nivel - 1), rng);
    const r = operar(op, a, b);
    const oculto = elegir(rng, posiciones);
    const faltante = oculto === "a" ? a : oculto === "b" ? b : r;
    const izq = oculto === "a" ? "□" : String(a);
    const der = oculto === "b" ? "□" : String(b);
    const expresion = `${izq} ${SIMBOLO[op]} ${der} = ${oculto === "r" ? "□" : r}`;
    const inversa: Record<Operacion, string> =
        oculto === "r"
            ? { suma: `${a} + ${b} = ${r}`, resta: `${a} − ${b} = ${r}`, multiplicacion: `${a} × ${b} = ${r}`, division: `${a} ÷ ${b} = ${r}` }
            : {
                  suma: `${r} − ${oculto === "a" ? b : a} = ${faltante}`,
                  resta: oculto === "a" ? `${r} + ${b} = ${a}` : `${a} − ${r} = ${b}`,
                  multiplicacion: `${r} ÷ ${oculto === "a" ? b : a} = ${faltante}`,
                  division: oculto === "a" ? `${r} × ${b} = ${a}` : `${a} ÷ ${r} = ${b}`,
              };
    return {
        tema: "operaciones_incompletas",
        nivel,
        interaccion,
        enunciado: interaccion === "arrastrar" ? "Arrastra el número que falta al recuadro" : "¿Qué número falta?",
        expresion,
        opciones: opcionesCon(faltante, rng),
        respuesta: String(faltante),
        pasos: [
            `Observa la operación: ${expresion}.`,
            oculto === "r" ? `Resuelve la operación: ${inversa[op]}.` : `Para encontrar el número que falta usa la operación inversa: ${inversa[op]}.`,
            `Comprueba: ${expresion.replace("□", String(faltante))}.`,
            `El número que falta es ${faltante}.`,
        ],
        datos: { a, b, operacion: op, oculto },
    };
}

const RANGOS_NUMEROS: [number, number][] = [[0, 20], [21, 100], [101, 999], [1000, 9999], [10000, 999999]];

function pasosEscritura(n: number): string[] {
    const pasos = [`Lee el número ${n.toLocaleString("es-MX")} por partes.`];
    if (n >= 1000) {
        const miles = Math.floor(n / 1000);
        const resto = n % 1000;
        pasos.push(`Los miles: ${miles} → «${miles === 1 ? "mil" : numeroAPalabras(miles * 1000)}».`);
        if (resto > 0) pasos.push(`Lo que sigue: ${resto} → «${numeroAPalabras(resto)}».`);
    } else if (n > 30) {
        pasos.push(`Separa centenas, decenas y unidades: ${digitos(n).reverse().join(" · ")}.`);
    }
    pasos.push(`Se escribe: «${numeroAPalabras(n)}».`);
    return pasos;
}

function generarEscritura(nivel: number, rng: Rng): Ejercicio {
    const [min, max] = RANGOS_NUMEROS[limitarNivel(nivel) - 1];
    const n = entero(rng, min, max);
    return {
        tema: "escritura_numeros",
        nivel,
        interaccion: "texto",
        enunciado: "Escribe con palabras este número",
        numeroMostrado: n,
        respuesta: numeroAPalabras(n),
        pasos: pasosEscritura(n),
        datos: { a: n },
    };
}

function generarIdentificar(nivel: number, rng: Rng): Ejercicio {
    const [min, max] = RANGOS_NUMEROS[limitarNivel(nivel) - 1];
    const cantidad = [6, 6, 9, 9, 12][limitarNivel(nivel) - 1];
    const usados = new Set<number>();
    // Números no consecutivos entre sí (RF-40)
    let guardia = 0;
    while (usados.size < cantidad && guardia++ < 1000) {
        const n = entero(rng, Math.max(min, 1), max);
        if (!usados.has(n) && !usados.has(n - 1) && !usados.has(n + 1)) usados.add(n);
    }
    const opciones = barajar(rng, [...usados]);
    const objetivo = elegir(rng, opciones);
    return {
        tema: "identificar_numero",
        nivel,
        interaccion: "seleccion_multiple",
        enunciado: `Toca el número «${numeroAPalabras(objetivo)}»`,
        opciones: opciones.map(String),
        respuesta: String(objetivo),
        pasos: [
            `Lee con calma: «${numeroAPalabras(objetivo)}».`,
            `Piensa cómo se escribe con cifras: ${objetivo}.`,
            `Busca en la cuadrícula el ${objetivo} y tócalo.`,
        ],
        datos: { a: objetivo },
    };
}

const FIGURAS = ["🍎", "⭐", "🐟", "🌸", "🚗", "🎈"];

function generarFiguras(nivel: number, rng: Rng): Ejercicio {
    const n = limitarNivel(nivel);
    const grupos = n <= 2 ? 2 : n <= 4 ? 3 : 4;
    const maximo = [5, 9, 9, 12, 12][n - 1];
    const emojis = barajar(rng, FIGURAS).slice(0, grupos);
    const figuras = emojis.map((emoji) => ({ emoji, cantidad: entero(rng, 1, maximo) }));
    const total = figuras.reduce((s, f) => s + f.cantidad, 0);
    return {
        tema: "suma_figuras",
        nivel,
        interaccion: "numero",
        enunciado: "¿Cuántas figuras hay en total?",
        figuras,
        respuesta: String(total),
        pasos: [
            ...figuras.map((f) => `Cuenta los ${f.emoji}: hay ${f.cantidad}.`),
            `Suma los grupos: ${figuras.map((f) => f.cantidad).join(" + ")} = ${total}.`,
            `En total hay ${total} figuras.`,
        ],
        datos: { a: total },
    };
}

export function generarEjercicio(
    tema: ClaveTema,
    nivel: number,
    interaccion: TipoInteraccion,
    rng: Rng = Math.random,
): Ejercicio {
    const n = limitarNivel(nivel);
    const asignable: InteraccionAsignable = interaccion === "arrastrar" ? "arrastrar" : "seleccion_multiple";
    switch (tema) {
        case "suma":
        case "resta":
        case "multiplicacion":
        case "division":
            return generarOperacion(tema, n, asignable, rng);
        case "operaciones_incompletas":
            return generarIncompleta(n, asignable, rng);
        case "escritura_numeros":
            return generarEscritura(n, rng);
        case "identificar_numero":
            return generarIdentificar(n, rng);
        case "suma_figuras":
            return generarFiguras(n, rng);
    }
}

// ---------- Evaluación ----------

export function evaluarRespuesta(e: Ejercicio, respuesta: string): { correcta: boolean } {
    if (e.tema === "escritura_numeros") return { correcta: coincideTolerante(respuesta, e.respuesta).correcta };
    return { correcta: respuesta.trim().replace(/\s+/g, "") === e.respuesta };
}

/** Tipo de error para el perfil estadístico (RF-19). */
export function clasificarError(e: Ejercicio, respuesta: string): string {
    if (e.tema === "escritura_numeros") {
        const d = distanciaEdicion(normalizarTexto(respuesta).replace(/ /g, ""), normalizarTexto(e.respuesta).replace(/ /g, ""));
        return d <= 4 ? "ortografia" : "lectura_numero";
    }
    if (e.tema === "identificar_numero") return "lectura_numero";
    if (e.tema === "suma_figuras") return "conteo";
    const n = Number(respuesta);
    if (!Number.isFinite(n)) return "formato";
    const { a, b, operacion } = e.datos;
    if (a !== undefined && b !== undefined && operacion && e.datos.oculto === "r") {
        if (operacion === "suma" && n === sumaSinAcarreo(a, b)) return "acarreo";
        if (operacion === "resta" && n === restaSinPrestamo(a, b)) return "prestamo";
        if ((operacion === "suma" && n === a - b) || (operacion === "resta" && n === a + b)) return "operacion_confundida";
        if (operacion === "multiplicacion" || operacion === "division") return "tablas";
    }
    if (e.tema === "operaciones_incompletas") return "operacion_inversa";
    return Math.abs(n - Number(e.respuesta)) <= 2 ? "calculo" : "otro";
}

export const ETIQUETA_ERROR: Record<string, string> = {
    acarreo: "Olvida llevar (acarreo)",
    prestamo: "Error al pedir prestado",
    operacion_confundida: "Confunde la operación",
    tablas: "Tablas de multiplicar",
    operacion_inversa: "Operación inversa",
    calculo: "Error de cálculo cercano",
    ortografia: "Ortografía menor",
    lectura_numero: "Lectura de números",
    conteo: "Conteo",
    formato: "Respuesta con formato inválido",
    con_ayuda: "Resuelto con solución guiada",
    otro: "Otro",
};

// ---------- Diagnóstico matemático (RF-55) ----------

export const PLAN_DIAGNOSTICO: readonly { tema: ClaveTema; nivel: number }[] = [
    { tema: "suma", nivel: 2 }, { tema: "suma", nivel: 4 },
    { tema: "resta", nivel: 2 }, { tema: "resta", nivel: 4 },
    { tema: "multiplicacion", nivel: 2 }, { tema: "multiplicacion", nivel: 4 },
    { tema: "division", nivel: 2 }, { tema: "division", nivel: 4 },
    { tema: "operaciones_incompletas", nivel: 2 }, { tema: "operaciones_incompletas", nivel: 4 },
];

/** Determinista por semilla: el servidor regenera el mismo examen para calificar. */
export function generarDiagnostico(semilla: number): Ejercicio[] {
    const rng = crearRng(semilla);
    return PLAN_DIAGNOSTICO.map((p) => generarEjercicio(p.tema, p.nivel, "seleccion_multiple", rng));
}

export interface RespuestaDiagnostico {
    indice: number;
    respuesta: string;
    tiempo_ms: number;
}

export interface ResultadoTema {
    aciertos: number;
    total: number;
    precision: number;
}

export interface ResultadoDiagnostico {
    aciertos: number;
    total: number;
    precision: number;
    tiempo_promedio_ms: number;
    resultado_por_tema: Record<string, ResultadoTema>;
    detalle: { indice: number; tema: TemaGenerador; correcta: boolean; tiempo_ms: number }[];
}

export function calificarDiagnostico(ejercicios: readonly Ejercicio[], respuestas: readonly RespuestaDiagnostico[]): ResultadoDiagnostico {
    const porTema: Record<string, ResultadoTema> = {};
    const detalle: ResultadoDiagnostico["detalle"] = [];
    let aciertos = 0;
    let tiempo = 0;
    ejercicios.forEach((e, indice) => {
        const r = respuestas.find((x) => x.indice === indice);
        const correcta = r ? evaluarRespuesta(e, r.respuesta).correcta : false;
        const tiempo_ms = r ? Math.max(0, Math.round(r.tiempo_ms)) : 0;
        if (correcta) aciertos++;
        tiempo += tiempo_ms;
        porTema[e.tema] ??= { aciertos: 0, total: 0, precision: 0 };
        porTema[e.tema].total++;
        if (correcta) porTema[e.tema].aciertos++;
        detalle.push({ indice, tema: e.tema, correcta, tiempo_ms });
    });
    for (const t of Object.values(porTema)) t.precision = Math.round((t.aciertos / t.total) * 100);
    const total = ejercicios.length;
    return {
        aciertos,
        total,
        precision: total ? Math.round((aciertos / total) * 100) : 0,
        tiempo_promedio_ms: total ? Math.round(tiempo / total) : 0,
        resultado_por_tema: porTema,
        detalle,
    };
}
