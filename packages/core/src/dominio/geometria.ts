// Geometría (contenido provisional, A-30): colorear la figura pedida (RF-44) y preguntas de
// lados, vértices y perímetro. Se reemplaza por el banco validado cuando exista (T-01-04).
import { barajar, elegir, entero, type Rng } from "./aleatorio";
import { opcionesCon, type Ejercicio, type Lienzo } from "./ejercicios";

export const FORMAS = [
    { id: "triangulo", nombre: "triángulo", plural: "triángulos", lados: 3 },
    { id: "cuadrado", nombre: "cuadrado", plural: "cuadrados", lados: 4 },
    { id: "circulo", nombre: "círculo", plural: "círculos", lados: 0 },
    { id: "rectangulo", nombre: "rectángulo", plural: "rectángulos", lados: 4 },
    { id: "rombo", nombre: "rombo", plural: "rombos", lados: 4 },
    { id: "pentagono", nombre: "pentágono", plural: "pentágonos", lados: 5 },
    { id: "hexagono", nombre: "hexágono", plural: "hexágonos", lados: 6 },
] as const;

export type Forma = (typeof FORMAS)[number]["id"];

/** 8 colores con nombre y patrón: el color nunca es la única pista (WCAG 1.4.1, 04-arquitectura §4). */
export const COLORES = [
    { id: "rojo", nombre: "rojo", hex: "#d62828", patron: "rayas" },
    { id: "azul", nombre: "azul", hex: "#1f5fbf", patron: "puntos" },
    { id: "verde", nombre: "verde", hex: "#2a9d3f", patron: "cuadros" },
    { id: "amarillo", nombre: "amarillo", hex: "#f5c400", patron: "liso" },
    { id: "morado", nombre: "morado", hex: "#7b3fb5", patron: "diagonal" },
    { id: "naranja", nombre: "naranja", hex: "#f07a10", patron: "ondas" },
    { id: "rosa", nombre: "rosa", hex: "#e05aa0", patron: "cruces" },
    { id: "cafe", nombre: "café", hex: "#8a5a2b", patron: "lineas" },
] as const;

export type Color = (typeof COLORES)[number]["id"];

const forma = (id: string) => FORMAS.find((f) => f.id === id)!;
const nombreColor = (id: string) => COLORES.find((c) => c.id === id)?.nombre ?? id;

// Por nivel: formas disponibles, número de figuras y cuántas son objetivo
const NIVELES_COLOREO: { formas: Forma[]; figuras: number; objetivos: [number, number] }[] = [
    { formas: ["triangulo", "cuadrado", "circulo"], figuras: 3, objetivos: [1, 1] },
    { formas: ["triangulo", "cuadrado", "circulo", "rectangulo"], figuras: 4, objetivos: [1, 2] },
    { formas: ["triangulo", "cuadrado", "circulo", "rectangulo", "rombo"], figuras: 5, objetivos: [2, 2] },
    { formas: ["triangulo", "cuadrado", "circulo", "rectangulo", "rombo", "pentagono", "hexagono"], figuras: 6, objetivos: [2, 3] },
    // Nivel 5: formas parecidas entre sí (cuadrado, rombo, rectángulo; pentágono y hexágono)
    { formas: ["cuadrado", "rombo", "rectangulo", "pentagono", "hexagono"], figuras: 7, objetivos: [2, 3] },
];

export function generarColorear(nivel: number, rng: Rng): Ejercicio {
    const n = Math.max(1, Math.min(5, Math.round(nivel)));
    const cfg = NIVELES_COLOREO[n - 1];
    const objetivo = elegir(rng, cfg.formas);
    const color = elegir(rng, COLORES).id;
    const cuantos = entero(rng, cfg.objetivos[0], cfg.objetivos[1]);
    const otras = cfg.formas.filter((f) => f !== objetivo);
    const tipos = barajar(rng, [
        ...Array.from({ length: cuantos }, () => objetivo),
        ...Array.from({ length: cfg.figuras - cuantos }, (_, i) => otras[i % otras.length]),
    ]);
    const lienzo: Lienzo = { figuras: tipos.map((tipo, i) => ({ id: `f${i + 1}`, tipo })), instruccion: { tipo: objetivo, color } };
    const f = forma(objetivo);
    const plural = cuantos > 1;
    return {
        tema: "colorear",
        nivel: n,
        interaccion: "seleccion_multiple",
        enunciado: `Pinta de ${nombreColor(color)} ${plural ? `todos los ${f.plural}` : `el ${f.nombre}`}`,
        lienzo,
        // Texto para la explicación final; la evaluación usa el lienzo (evaluarColoreo)
        respuesta: `${plural ? `los ${cuantos} ${f.plural}` : `el ${f.nombre}`} de color ${nombreColor(color)}`,
        pasos: [
            f.lados ? `Un ${f.nombre} tiene ${f.lados} lados. Búscalo entre las figuras.` : `Un círculo es redondo: no tiene lados ni esquinas.`,
            plural ? `Hay ${cuantos} ${f.plural}: encuéntralos todos.` : `Solo hay un ${f.nombre}.`,
            `Elige el color ${nombreColor(color)} en la paleta.`,
            `Toca ${plural ? `cada ${f.nombre}` : `el ${f.nombre}`} para pintarlo. No pintes de ${nombreColor(color)} ninguna otra figura.`,
        ],
        datos: {},
    };
}

/** RF-44: todas las figuras objetivo con el color pedido y ninguna otra figura con ese color. */
export function evaluarColoreo(lienzo: Lienzo, coloreo: Record<string, string>): boolean {
    const { tipo, color } = lienzo.instruccion;
    return lienzo.figuras.every((f) => (f.tipo === tipo) === (coloreo[f.id] === color));
}

/** Respuesta del cliente para colorear: JSON { idFigura: color }. null si no es válida. */
export function leerColoreo(respuesta: string): Record<string, string> | null {
    try {
        const v = JSON.parse(respuesta);
        if (!v || typeof v !== "object" || Array.isArray(v)) return null;
        return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === "string"));
    } catch {
        return null;
    }
}

/** Figura equivocada → lectura; figura correcta con otro color → selección (tabla de EXP-04). */
export function errorColoreo(lienzo: Lienzo, coloreo: Record<string, string> | null): "lectura" | "seleccion" | "otro" {
    if (!coloreo) return "otro";
    const { tipo, color } = lienzo.instruccion;
    const figuraEquivocada = lienzo.figuras.some((f) => f.tipo !== tipo && coloreo[f.id] === color);
    return figuraEquivocada ? "lectura" : "seleccion";
}

// ───────────── Preguntas de geometría (selección múltiple) ─────────────

export function generarGeometria(nivel: number, rng: Rng): Ejercicio {
    const n = Math.max(1, Math.min(5, Math.round(nivel)));
    const conLados = FORMAS.filter((f) => f.lados > 0 && (n >= 3 || f.lados <= 4));
    if (n <= 3) {
        const f = elegir(rng, conLados);
        const pregunta = n === 3 ? "vértices (esquinas)" : "lados";
        return {
            tema: "geometria",
            nivel: n,
            interaccion: "seleccion_multiple",
            enunciado: `¿Cuántos ${pregunta} tiene un ${f.nombre}?`,
            opciones: opcionesSinNegativos(f.lados, rng),
            respuesta: String(f.lados),
            pasos: [
                `Imagina o dibuja un ${f.nombre}.`,
                n === 3 ? `Los vértices son las esquinas: en un polígono hay tantas esquinas como lados.` : `Cuenta cada línea recta del borde.`,
                `Un ${f.nombre} tiene ${f.lados} ${n === 3 ? "vértices" : "lados"}.`,
            ],
            datos: { a: f.lados },
        };
    }
    // Perímetro: nivel 4 cuadrado, nivel 5 rectángulo
    if (n === 4) {
        const l = entero(rng, 2, 12);
        return {
            tema: "geometria",
            nivel: n,
            interaccion: "seleccion_multiple",
            enunciado: `Un cuadrado mide ${l} cm de cada lado. ¿Cuál es su perímetro en cm?`,
            opciones: opcionesSinNegativos(4 * l, rng, [l * l, 2 * l]),
            respuesta: String(4 * l),
            pasos: [`El perímetro es la suma de todos los lados.`, `Un cuadrado tiene 4 lados iguales: ${l} + ${l} + ${l} + ${l}.`, `${l} × 4 = ${4 * l} cm.`],
            datos: { a: l, b: 4 },
        };
    }
    const a = entero(rng, 3, 15);
    const b = entero(rng, 2, a - 1);
    const p = 2 * (a + b);
    return {
        tema: "geometria",
        nivel: n,
        interaccion: "seleccion_multiple",
        enunciado: `Un rectángulo mide ${a} cm de largo y ${b} cm de ancho. ¿Cuál es su perímetro en cm?`,
        opciones: opcionesSinNegativos(p, rng, [a * b, a + b]),
        respuesta: String(p),
        pasos: [`El perímetro es la suma de los 4 lados.`, `Tiene dos lados de ${a} cm y dos de ${b} cm: ${a} + ${b} + ${a} + ${b}.`, `2 × (${a} + ${b}) = ${p} cm.`],
        datos: { a, b },
    };
}

function opcionesSinNegativos(correcta: number, rng: Rng, extra: number[] = []): string[] {
    return opcionesCon(correcta, rng, extra.filter((x) => x !== correcta && x >= 0));
}
