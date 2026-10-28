// P-UNIT-03/04/08 · reglas por tipo (RF-40, RF-42), evaluación y clasificación de errores (RF-19)
import { describe, expect, it } from "vitest";
import { crearRng } from "../../src/modules/shared/dominio/aleatorio";
import { combinacionDisponible, clasificarError, esCorrecta, generarParaActividad } from "../../src/modules/shared/dominio/contenido";
import { TIPOS_POR_TEMA } from "../../src/modules/shared/dominio/catalogo";
import type { Ejercicio } from "../../src/modules/shared/dominio/ejercicios";

describe("combinaciones disponibles", () => {
    it("son un subconjunto del catálogo y todas generan ejercicios válidos en los 5 niveles", () => {
        for (const [tema, tipos] of Object.entries(TIPOS_POR_TEMA)) {
            for (const tipo of tipos) {
                if (!combinacionDisponible(tema, tipo)) continue;
                const rng = crearRng(tema.length * 97 + tipo.length);
                for (let nivel = 1; nivel <= 5; nivel++) {
                    for (let i = 0; i < 20; i++) {
                        const e = generarParaActividad(tema, tipo, nivel, rng);
                        expect(e, `${tema}/${tipo}`).not.toBeNull();
                        expect(esCorrecta(e!, e!.respuesta)).toBe(true);
                        expect(e!.opciones).toContain(e!.respuesta);
                        expect(e!.pasos.length).toBeGreaterThanOrEqual(2);
                    }
                }
            }
        }
        expect(generarParaActividad("geometria", "colorear_figura", 2, crearRng(1))).toBeNull();
    });

    it("RF-40: en «encuentra el número» ningún par de opciones es consecutivo", () => {
        const rng = crearRng(40);
        for (let i = 0; i < 200; i++) {
            const e = generarParaActividad("numeros", "identificar_numero", 1 + (i % 5), rng)!;
            const n = e.opciones!.map(Number).sort((a, b) => a - b);
            for (let j = 1; j < n.length; j++) expect(n[j] - n[j - 1]).not.toBe(1);
        }
    });

    it("RF-42: el faltante aparece en cualquier posición y respeta la operación del tema", () => {
        const rng = crearRng(42);
        const posiciones = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const e = generarParaActividad("division", "completar_operacion", 3, rng)!;
            expect(e.datos.operacion).toBe("division");
            expect(e.expresion).toContain("÷");
            posiciones.add(e.datos.oculto!);
            const { a, b } = e.datos;
            expect(Number.isInteger(a! / b!)).toBe(true); // división exacta
        }
        expect([...posiciones].sort()).toEqual(["a", "b", "r"]);
    });
});

describe("evaluación y tipo de error", () => {
    const resta: Ejercicio = {
        tema: "resta", nivel: 2, interaccion: "seleccion_multiple", enunciado: "¿Cuánto es 47 − 18?", opciones: ["29", "65", "39", "28"],
        respuesta: "29", pasos: ["a", "b"], datos: { a: 47, b: 18, operacion: "resta", oculto: "r" },
    };
    it("ignora espacios y mayúsculas", () => {
        expect(esCorrecta(resta, " 29 ")).toBe(true);
        expect(esCorrecta(resta, "2 9")).toBe(true);
        expect(esCorrecta(resta, "30")).toBe(false);
    });
    it("procedimiento: el resultado de otra operación; cálculo: ±1 o ±10; si no, selección", () => {
        expect(clasificarError(resta, "65")).toBe("procedimiento"); // sumó
        expect(clasificarError(resta, "28")).toBe("calculo");
        expect(clasificarError(resta, "39")).toBe("calculo");
        expect(clasificarError(resta, "50")).toBe("seleccion");
        expect(clasificarError(resta, "abc")).toBe("otro");
    });
    it("encuentra el número: lectura", () => {
        expect(clasificarError({ ...resta, tema: "identificar_numero", datos: {} }, "12")).toBe("lectura");
    });
});
