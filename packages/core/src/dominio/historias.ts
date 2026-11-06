// Problemas con historia generados por OpenAI (EXP-04.7, ADR-007, RI-07). El modelo solo redacta el
// texto: los números, la respuesta, las opciones y los pasos los pone el generador determinista, así
// que la respuesta siempre es calculable y está en el rango del nivel. Aquí vive todo lo puro:
// qué ejercicios se pueden contar como historia, el prompt (sin PII), la validación y la mezcla.
import type { TipoInteraccionActividad } from "./catalogo";
import type { Ejercicio, Operacion } from "./ejercicios";
import { normalizarTexto } from "./numeros";

// ───────────── Intereses genéricos (sin PII) ─────────────

/**
 * Los intereses del alumno son texto libre del docente; al prompt solo llega uno de este catálogo.
 * Clave = forma normalizada que puede escribir el docente → tema genérico para la historia.
 */
const INTERESES: Record<string, string> = {
    futbol: "el fútbol",
    deportes: "los deportes",
    basquetbol: "el básquetbol",
    natacion: "la natación",
    animales: "los animales",
    mascotas: "las mascotas",
    perros: "los perros",
    gatos: "los gatos",
    dinosaurios: "los dinosaurios",
    espacio: "el espacio",
    planetas: "el espacio",
    musica: "la música",
    baile: "el baile",
    dibujo: "el dibujo",
    arte: "el arte",
    pintura: "el arte",
    videojuegos: "los videojuegos",
    juegos: "los juegos de mesa",
    naturaleza: "la naturaleza",
    plantas: "las plantas",
    jardin: "el jardín",
    mar: "el mar",
    cocina: "la cocina",
    cocinar: "la cocina",
    ciencia: "la ciencia",
    experimentos: "la ciencia",
    libros: "los libros",
    lectura: "los libros",
    leer: "los libros",
    carros: "los carros",
    coches: "los carros",
    trenes: "los trenes",
    robots: "los robots",
    superheroes: "los superhéroes",
    bicicleta: "la bicicleta",
    insectos: "los insectos",
};

/** Contextos de respaldo cuando el alumno no tiene intereses reconocibles. */
export const INTERESES_POR_DEFECTO = ["los animales", "los deportes", "la naturaleza", "la cocina"] as const;

/** Intereses del catálogo que coinciden con los del alumno (sin repetir); el resto se descarta. */
export function interesesGenericos(intereses: readonly string[]): string[] {
    const reconocidos = intereses
        .map((i) => INTERESES[normalizarTexto(i).replace(/\s+/g, "")])
        .filter((i): i is string => Boolean(i));
    return [...new Set(reconocidos)];
}

/** Interés para el ejercicio número `indice` de la actividad: se van alternando. */
export function interesPara(intereses: readonly string[], indice: number): string {
    const lista = interesesGenericos(intereses);
    const fuente = lista.length ? lista : INTERESES_POR_DEFECTO;
    return fuente[indice % fuente.length];
}

// ───────────── Qué ejercicios se pueden contar como historia ─────────────

const OPERACIONES: readonly Operacion[] = ["suma", "resta", "multiplicacion", "division"];

/** Datos que se envían al modelo: solo operación, números, nivel e interés genérico (ADR-007). */
export interface PedidoHistoria {
    operacion: Operacion;
    a: number;
    b: number;
    nivel: number;
    interes: string;
}

/**
 * Pedido para contar el ejercicio como historia, o null si no aplica: solo operaciones directas
 * (resultado oculto) de opción múltiple o arrastrar, y cuyo resultado no sea uno de los operandos
 * (p. ej. 7 × 1), porque la historia lo dejaría a la vista.
 */
export function pedidoDeHistoria(e: Ejercicio, tipo: TipoInteraccionActividad, interes: string): PedidoHistoria | null {
    if (tipo !== "seleccion_multiple" && tipo !== "arrastrar") return null;
    const { a, b, operacion, oculto } = e.datos;
    if (a === undefined || b === undefined || !operacion || oculto !== "r") return null;
    if (!OPERACIONES.includes(operacion) || e.tema !== operacion) return null;
    if (e.respuesta === String(a) || e.respuesta === String(b)) return null;
    return { operacion, a, b, nivel: e.nivel, interes };
}

// ───────────── Prompt ─────────────

const QUE_PIDE: Record<Operacion, string> = {
    suma: "juntar o agregar (suma)",
    resta: "quitar o comparar (resta)",
    multiplicacion: "grupos iguales (multiplicación)",
    division: "repartir en partes iguales (división exacta)",
};

export const LIMITES = { historia: 220, pregunta: 120 } as const;

export interface Mensaje {
    role: "system" | "user";
    content: string;
}

/** Mensajes para el modelo. Solo contienen los campos de PedidoHistoria: nada del alumno. */
export function mensajesHistoria(p: PedidoHistoria): Mensaje[] {
    return [
        {
            role: "system",
            content: [
                "Escribes problemas de matemáticas para niñas y niños de primaria en México (8 a 10 años).",
                "Usa español de México, sencillo, amable y positivo.",
                'Responde SOLO con un objeto JSON: {"historia": string, "pregunta": string}.',
                `Reglas: la historia tiene una o dos oraciones cortas (máximo ${LIMITES.historia} caracteres) sobre el tema indicado.`,
                "Usa exactamente los dos números indicados, escritos con cifras, y ningún otro número (tampoco con palabras, como «dos» o «docena»).",
                "No escribas el resultado ni la operación con símbolos.",
                "No uses nombres propios de personas, marcas, lugares reales, violencia, peligro ni temas que den miedo.",
                `La pregunta (máximo ${LIMITES.pregunta} caracteres) termina en «?» y pide el resultado de la operación indicada.`,
            ].join(" "),
        },
        {
            role: "user",
            content: JSON.stringify({ tema: p.interes, operacion: QUE_PIDE[p.operacion], numeros: [p.a, p.b], nivel: p.nivel }),
        },
    ];
}

// ───────────── Validación de lo que devuelve el modelo ─────────────

export interface Historia {
    historia: string;
    pregunta: string;
}

const PALABRAS_NUMERO =
    /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieci\w+|veinte|veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|cientos|mil|docena|docenas|decena|decenas|centena|centenas|par|pares|doble|triple|mitad)\b/;

/** Cifras del texto, con separadores de miles («1,000», «1 000», «1.000») ya resueltos. */
function numerosDelTexto(texto: string): number[] {
    return (texto.match(/\d{1,3}(?:[,.  ]\d{3})+(?!\d)|\d+/g) ?? []).map((n) => Number(n.replace(/\D/g, "")));
}

/**
 * Historia limpia o null si no se puede mostrar: estructura, longitudes, sin enlaces ni marcado,
 * con los dos números pedidos y ningún otro (así no revela el resultado ni mete distractores).
 */
export function validarHistoria(crudo: unknown, p: PedidoHistoria): Historia | null {
    if (!crudo || typeof crudo !== "object") return null;
    const { historia, pregunta } = crudo as Record<string, unknown>;
    if (typeof historia !== "string" || typeof pregunta !== "string") return null;
    const h = historia.replace(/\s+/g, " ").trim();
    const q = pregunta.replace(/\s+/g, " ").trim();
    if (h.length < 15 || h.length > LIMITES.historia || q.length < 8 || q.length > LIMITES.pregunta) return null;
    if (!q.endsWith("?")) return null;
    const texto = `${h} ${q}`;
    if (/https?:|www\.|@|[<>{}[\]\\`*#_|=+×÷−]/i.test(texto)) return null;
    if (PALABRAS_NUMERO.test(normalizarTexto(texto))) return null;
    const numeros = numerosDelTexto(texto);
    if (!numeros.includes(p.a) || !numeros.includes(p.b)) return null;
    if (numeros.some((n) => n !== p.a && n !== p.b)) return null;
    return { historia: h, pregunta: q };
}

/** El ejercicio del generador con el texto de la historia; respuesta, opciones y pasos no cambian. */
export function aplicarHistoria(e: Ejercicio, h: Historia): Ejercicio {
    const { a, b, operacion } = e.datos;
    const simbolo: Record<Operacion, string> = { suma: "+", resta: "−", multiplicacion: "×", division: "÷" };
    return {
        ...e,
        enunciado: `${h.historia} ${h.pregunta}`,
        pasos: [`Piensa qué operación pide la historia: ${a} ${simbolo[operacion!]} ${b}.`, ...e.pasos],
    };
}

// ───────────── Historia simulada (OPENAI_MODE=mock: desarrollo, CI y E2E) ─────────────

export function historiaSimulada(p: PedidoHistoria): Historia {
    const { a, b, interes } = p;
    switch (p.operacion) {
        case "suma":
            return { historia: `En el proyecto sobre ${interes} hay ${a} tarjetas y llegan ${b} tarjetas más.`, pregunta: "¿Cuántas tarjetas hay en total?" };
        case "resta":
            return { historia: `En el proyecto sobre ${interes} había ${a} tarjetas y se regalaron ${b}.`, pregunta: "¿Cuántas tarjetas quedan?" };
        case "multiplicacion":
            return { historia: `Para la feria sobre ${interes} se arman ${a} cajas con ${b} tarjetas cada una.`, pregunta: "¿Cuántas tarjetas se usan en total?" };
        case "division":
            return { historia: `En la feria sobre ${interes} se reparten ${a} tarjetas entre ${b} mesas por igual.`, pregunta: "¿Cuántas tarjetas le tocan a cada mesa?" };
    }
}

// ───────────── Costo (presupuesto mensual, RC-04) ─────────────

export interface Precios {
    /** USD por millón de tokens de entrada / salida. */
    entrada: number;
    salida: number;
}

export const costoUsd = (tokensEntrada: number, tokensSalida: number, precios: Precios): number =>
    (tokensEntrada * precios.entrada + tokensSalida * precios.salida) / 1_000_000;

/** Cota superior del costo de una llamada, para reservar antes de hacerla (≈ 3 caracteres por token). */
export function costoMaximoUsd(mensajes: readonly Mensaje[], maxTokensSalida: number, precios: Precios): number {
    const caracteres = mensajes.reduce((s, m) => s + m.content.length, 0);
    return costoUsd(Math.ceil(caracteres / 3) + 20, maxTokensSalida, precios);
}
