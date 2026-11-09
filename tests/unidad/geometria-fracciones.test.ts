// P-UNIT-03/04 · contenido provisional de geometría y fracciones (A-30) y regla de coloreo (RF-44)
import { describe, expect, it } from "vitest";
import { crearRng } from "@numotion/core/dominio/aleatorio";
import { combinacionDisponible, clasificarError, esCorrecta, generarParaActividad, validacionLocal } from "@numotion/core/dominio/contenido";
import { COLORES, evaluarColoreo, FORMAS, generarColorear } from "@numotion/core/dominio/geometria";
import { TIPOS_POR_TEMA } from "@numotion/core/dominio/catalogo";

const coloreoCorrecto = (e: ReturnType<typeof generarColorear>) => {
    const { figuras, instruccion } = e.lienzo!;
    return JSON.stringify(Object.fromEntries(figuras.filter((f) => f.tipo === instruccion.tipo).map((f) => [f.id, instruccion.color])));
};

describe("catálogo completo", () => {
    it("todas las combinaciones del catálogo ya tienen contenido", () => {
        for (const [tema, tipos] of Object.entries(TIPOS_POR_TEMA)) for (const t of tipos) expect(combinacionDisponible(tema, t), `${tema}/${t}`).toBe(true);
    });

    it("cada combinación genera ejercicios válidos en los 5 niveles", () => {
        for (const [tema, tipos] of Object.entries(TIPOS_POR_TEMA)) {
            for (const tipo of tipos) {
                const rng = crearRng(tema.length * 31 + tipo.length);
                for (let nivel = 1; nivel <= 5; nivel++) {
                    for (let i = 0; i < 20; i++) {
                        const e = generarParaActividad(tema, tipo, nivel, rng)!;
                        expect(e, `${tema}/${tipo}/${nivel}`).not.toBeNull();
                        expect(e.pasos.length).toBeGreaterThanOrEqual(2);
                        const correcta = tipo === "colorear_figura" ? coloreoCorrecto(e) : e.respuesta;
                        expect(esCorrecta(e, correcta), `${tema}/${tipo}/${nivel}: ${correcta}`).toBe(true);
                        if (e.opciones) {
                            expect(e.opciones).toContain(e.respuesta);
                            expect(new Set(e.opciones).size).toBe(e.opciones.length);
                        }
                    }
                }
            }
        }
    });
});

describe("colorear (RF-44)", () => {
    it("el lienzo tiene ids únicos, al menos una figura objetivo y una distractora, y crece con el nivel", () => {
        const rng = crearRng(44);
        for (let nivel = 1; nivel <= 5; nivel++) {
            const e = generarColorear(nivel, rng);
            const { figuras, instruccion } = e.lienzo!;
            expect(new Set(figuras.map((f) => f.id)).size).toBe(figuras.length);
            expect(figuras.some((f) => f.tipo === instruccion.tipo)).toBe(true);
            expect(figuras.some((f) => f.tipo !== instruccion.tipo)).toBe(true);
            expect(FORMAS.map((f) => f.id)).toContain(instruccion.tipo);
            expect(COLORES.map((c) => c.id)).toContain(instruccion.color);
            expect(figuras.length).toBeGreaterThanOrEqual(nivel + 2);
        }
    });

    const lienzo = {
        figuras: [{ id: "f1", tipo: "triangulo" }, { id: "f2", tipo: "circulo" }, { id: "f3", tipo: "triangulo" }],
        instruccion: { tipo: "triangulo", color: "rojo" },
    } as const;

    it("correcto = todas las figuras objetivo con el color pedido y ninguna otra con ese color", () => {
        expect(evaluarColoreo(lienzo, { f1: "rojo", f3: "rojo" })).toBe(true);
        expect(evaluarColoreo(lienzo, { f1: "rojo", f3: "rojo", f2: "azul" })).toBe(true); // otra figura de otro color: vale
        expect(evaluarColoreo(lienzo, { f1: "rojo" })).toBe(false); // falta un triángulo
        expect(evaluarColoreo(lienzo, { f1: "rojo", f3: "rojo", f2: "rojo" })).toBe(false); // el círculo también rojo
        expect(evaluarColoreo(lienzo, { f1: "azul", f3: "azul" })).toBe(false);
    });

    it("tipo de error: color equivocado → selección; figura equivocada → lectura; respuesta ilegible → otro", () => {
        const e = { ...generarColorear(2, crearRng(1)), lienzo };
        expect(clasificarError(e, JSON.stringify({ f1: "azul", f3: "azul" }))).toBe("seleccion");
        expect(clasificarError(e, JSON.stringify({ f2: "rojo" }))).toBe("lectura");
        expect(clasificarError(e, "no-es-json")).toBe("otro");
        expect(esCorrecta(e, "no-es-json")).toBe(false);
    });

    it("cada color tiene nombre y patrón (no depende solo del color, WCAG 1.4.1)", () => {
        expect(COLORES).toHaveLength(8);
        expect(new Set(COLORES.map((c) => c.patron)).size).toBe(8);
    });
});

describe("validación optimista en el cliente", () => {
    it("solo para respuestas cerradas; no para texto libre ni coloreo", () => {
        expect(validacionLocal("suma")).toBe(true);
        expect(validacionLocal("fracciones")).toBe(true);
        expect(validacionLocal("escritura_numeros")).toBe(false);
        expect(validacionLocal("colorear")).toBe(false);
    });
});

describe("números con letras (RF-39, A-07) y suma con figuras (RF-41)", () => {
    it("tolera un error por cada 8 letras", () => {
        const e = generarParaActividad("numeros", "numero_a_palabras", 2, crearRng(39))!;
        expect(esCorrecta(e, e.respuesta.toUpperCase())).toBe(true);
        expect(esCorrecta(e, e.respuesta.slice(1))).toBe(true); // una letra menos
        expect(esCorrecta(e, "zzzzzzzz")).toBe(false);
        expect(clasificarError(e, e.respuesta.slice(2) + "xx")).toMatch(/ortografia|lectura/);
    });

    it("suma con figuras: el total es la suma de los grupos", () => {
        const rng = crearRng(41);
        for (let i = 0; i < 50; i++) {
            const e = generarParaActividad("suma", "suma_figuras", 1 + (i % 5), rng)!;
            expect(Number(e.respuesta)).toBe(e.figuras!.reduce((s, f) => s + f.cantidad, 0));
            expect(clasificarError(e, String(Number(e.respuesta) + 1))).toBe("calculo");
        }
    });
});

describe("fracciones", () => {
    it("las respuestas son fracciones o enteros correctos y el arrastre lleva recuadro", () => {
        const rng = crearRng(7);
        for (let nivel = 1; nivel <= 5; nivel++) {
            const e = generarParaActividad("fracciones", "arrastrar", nivel, rng)!;
            expect(e.respuesta).toMatch(/^\d+(\/\d+)?$/);
            expect(e.expresion ?? "□").toContain("□");
        }
    });
});
