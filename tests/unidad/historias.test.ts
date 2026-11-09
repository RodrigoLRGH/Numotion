// T-03-04-20 · problemas con historia (EXP-04.7, ADR-007): intereses sin PII, qué se puede contar
// como historia, validación de lo que devuelve el modelo y que la respuesta no cambia.
import { describe, expect, it } from "vitest";
import { crearRng } from "@numotion/core/dominio/aleatorio";
import { esCorrecta, generarParaActividad } from "@numotion/core/dominio/contenido";
import {
    aplicarHistoria,
    costoMaximoUsd,
    costoUsd,
    historiaSimulada,
    INTERESES_POR_DEFECTO,
    interesesGenericos,
    interesPara,
    mensajesHistoria,
    pedidoDeHistoria,
    validarHistoria,
    type PedidoHistoria,
} from "@numotion/core/dominio/historias";

const pedido: PedidoHistoria = { operacion: "suma", a: 23, b: 15, nivel: 3, interes: "el fútbol" };

describe("intereses genéricos (sin PII)", () => {
    it("reconoce intereses del catálogo sin importar acentos, mayúsculas ni espacios y descarta el resto", () => {
        expect(interesesGenericos(["Fútbol", "  DINOSAURIOS ", "Súper héroes", "mi primo Juan", "Calle 5 #12", "futbol"])).toEqual([
            "el fútbol",
            "los dinosaurios",
            "los superhéroes",
        ]);
    });

    it("alterna los intereses por ejercicio y usa los de respaldo si no hay ninguno reconocible", () => {
        expect([0, 1, 2].map((i) => interesPara(["animales", "espacio"], i))).toEqual(["los animales", "el espacio", "los animales"]);
        expect(interesPara([], 1)).toBe(INTERESES_POR_DEFECTO[1]);
        expect(interesPara(["María López"], 0)).toBe(INTERESES_POR_DEFECTO[0]);
    });
});

describe("qué ejercicios se cuentan como historia", () => {
    it("solo operaciones directas de opción múltiple o arrastrar", () => {
        const rng = crearRng(7);
        for (const tema of ["suma", "resta", "multiplicacion", "division"]) {
            for (const tipo of ["seleccion_multiple", "arrastrar"] as const) {
                const e = generarParaActividad(tema, tipo, 3, rng)!;
                const p = pedidoDeHistoria(e, tipo, "el mar");
                expect(p, `${tema}/${tipo}`).toMatchObject({ operacion: tema, a: e.datos.a, b: e.datos.b, nivel: 3, interes: "el mar" });
            }
        }
        const incompleta = generarParaActividad("suma", "completar_operacion", 3, rng)!;
        expect(pedidoDeHistoria(incompleta, "completar_operacion", "el mar")).toBeNull();
        const figuras = generarParaActividad("suma", "suma_figuras", 2, rng)!;
        expect(pedidoDeHistoria(figuras, "suma_figuras", "el mar")).toBeNull();
        const fraccion = generarParaActividad("fracciones", "seleccion_multiple", 2, rng)!;
        expect(pedidoDeHistoria(fraccion, "seleccion_multiple", "el mar")).toBeNull();
    });

    it("no cuando el resultado es uno de los números (la historia lo dejaría a la vista)", () => {
        const e = generarParaActividad("multiplicacion", "seleccion_multiple", 1, crearRng(1))!;
        const conUno = { ...e, datos: { ...e.datos, a: 7, b: 1 }, respuesta: "7" };
        expect(pedidoDeHistoria(conUno, "seleccion_multiple", "el mar")).toBeNull();
    });
});

describe("prompt (P-INT-02: sin PII)", () => {
    it("solo lleva operación, números, nivel e interés genérico", () => {
        const mensajes = mensajesHistoria(pedido);
        expect(mensajes.map((m) => m.role)).toEqual(["system", "user"]);
        expect(Object.keys(JSON.parse(mensajes[1].content)).sort()).toEqual(["nivel", "numeros", "operacion", "tema"]);
        expect(JSON.parse(mensajes[1].content)).toMatchObject({ tema: "el fútbol", numeros: [23, 15], nivel: 3 });
    });
});

describe("validación de la historia", () => {
    const ok = { historia: "En el partido de fútbol hay 23 balones y llegan 15 balones más.", pregunta: "¿Cuántos balones hay?" };

    it("acepta una historia correcta y limpia espacios", () => {
        expect(validarHistoria({ historia: `  ${ok.historia}\n`, pregunta: ok.pregunta }, pedido)).toEqual(ok);
        expect(validarHistoria({ historia: "Hay 1,023 estampas y 15 más.", pregunta: "¿Cuántas estampas hay?" }, { ...pedido, a: 1023 })).not.toBeNull();
    });

    it.each([
        ["no es objeto", "texto"],
        ["faltan campos", { historia: ok.historia }],
        ["tipos incorrectos", { historia: 23, pregunta: ok.pregunta }],
        ["pregunta sin ?", { ...ok, pregunta: "Cuántos balones hay" }],
        ["historia muy corta", { ...ok, historia: "Hay 23 y 15." }],
        ["historia muy larga", { ...ok, historia: `${ok.historia} ${"Muy bien. ".repeat(30)}` }],
        ["revela el resultado", { ...ok, pregunta: "¿Son 38 balones?" }],
        ["otro número", { ...ok, historia: "En 3 partidos hay 23 balones y llegan 15 balones más." }],
        ["falta un número", { ...ok, historia: "En el partido de fútbol hay 23 balones y llegan más balones." }],
        ["número con palabras", { ...ok, historia: "Dos equipos tienen 23 balones y llegan 15 balones más." }],
        ["enlace", { ...ok, historia: `${ok.historia} Mira www.ejemplo.com` }],
        ["marcado", { ...ok, historia: `<b>${ok.historia}</b>` }],
        ["operación con símbolos", { ...ok, pregunta: "¿Cuánto es 23 + 15?" }],
    ])("rechaza: %s", (_caso, crudo) => {
        expect(validarHistoria(crudo, pedido)).toBeNull();
    });
});

describe("historia aplicada al ejercicio", () => {
    it("cambia el texto y agrega un paso; respuesta, opciones y datos quedan iguales", () => {
        const e = generarParaActividad("resta", "seleccion_multiple", 2, crearRng(3))!;
        const p = pedidoDeHistoria(e, "seleccion_multiple", "los gatos")!;
        const h = validarHistoria(historiaSimulada(p), p)!;
        const con = aplicarHistoria(e, h);
        expect(con.enunciado).toBe(`${h.historia} ${h.pregunta}`);
        expect(con.pasos[0]).toBe(`Piensa qué operación pide la historia: ${e.datos.a} − ${e.datos.b}.`);
        expect(con.pasos.slice(1)).toEqual(e.pasos);
        expect([con.respuesta, con.opciones, con.datos]).toEqual([e.respuesta, e.opciones, e.datos]);
        expect(esCorrecta(con, e.respuesta)).toBe(true);
    });

    it("la historia simulada pasa la validación en todas las operaciones y niveles", () => {
        const rng = crearRng(11);
        for (const tema of ["suma", "resta", "multiplicacion", "division"]) {
            for (let nivel = 1; nivel <= 5; nivel++) {
                for (let i = 0; i < 25; i++) {
                    const e = generarParaActividad(tema, "seleccion_multiple", nivel, rng)!;
                    const p = pedidoDeHistoria(e, "seleccion_multiple", "la ciencia");
                    if (p) expect(validarHistoria(historiaSimulada(p), p), `${tema} ${e.datos.a},${e.datos.b}`).not.toBeNull();
                }
            }
        }
    });
});

describe("costo", () => {
    it("calcula por millón de tokens y la reserva es una cota superior", () => {
        const precios = { entrada: 0.15, salida: 0.6 };
        expect(costoUsd(1_000_000, 1_000_000, precios)).toBeCloseTo(0.75);
        const mensajes = mensajesHistoria(pedido);
        const reserva = costoMaximoUsd(mensajes, 300, precios);
        const caracteres = mensajes.reduce((s, m) => s + m.content.length, 0);
        expect(reserva).toBeGreaterThanOrEqual(costoUsd(caracteres / 4, 300, precios));
    });
});
