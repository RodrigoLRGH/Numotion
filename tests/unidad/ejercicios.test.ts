import { describe, expect, it } from "vitest";
import { crearRng } from "../../src/modules/shared/dominio/aleatorio";
import {
    aPublico,
    calificarDiagnostico,
    clasificarError,
    evaluarRespuesta,
    generarDiagnostico,
    generarEjercicio,
    TEMAS,
} from "../../src/modules/shared/dominio/ejercicios";
import { coincideTolerante, numeroAPalabras } from "../../src/modules/shared/dominio/numeros";
import { balancePanas } from "../../src/modules/shared/dominio/panas";

describe("generarEjercicio", () => {
    for (const tema of TEMAS) {
        for (const nivel of [1, 2, 3, 4, 5]) {
            for (const interaccion of tema.interacciones) {
                it(`${tema.clave} nivel ${nivel} (${interaccion}) es consistente`, () => {
                    const rng = crearRng(nivel * 31 + tema.clave.length);
                    for (let i = 0; i < 25; i++) {
                        const e = generarEjercicio(tema.clave, nivel, interaccion, rng);
                        expect(e.pasos.length).toBeGreaterThan(0);
                        expect(evaluarRespuesta(e, e.respuesta).correcta).toBe(true);
                        if (e.opciones) {
                            expect(e.opciones).toContain(e.respuesta);
                            expect(new Set(e.opciones).size).toBe(e.opciones.length);
                        }
                        if (tema.clave === "division") expect(Number.isInteger(Number(e.respuesta))).toBe(true);
                        if (tema.clave === "resta") expect(Number(e.respuesta)).toBeGreaterThanOrEqual(0);
                    }
                });
            }
        }
    }

    it("la versión pública no expone respuesta ni pasos", () => {
        const e = generarEjercicio("suma", 3, "arrastrar", crearRng(1));
        const p = aPublico(e) as Record<string, unknown>;
        expect(p.respuesta).toBeUndefined();
        expect(p.pasos).toBeUndefined();
        expect(p.datos).toBeUndefined();
    });

    it("clasifica el error de acarreo", () => {
        const e = { ...generarEjercicio("suma", 3, "seleccion_multiple", crearRng(2)), datos: { a: 47, b: 38, operacion: "suma" as const, oculto: "r" as const }, respuesta: "85" };
        expect(clasificarError(e, "75")).toBe("acarreo");
    });
});

describe("diagnóstico (RF-55)", () => {
    it("es determinista por semilla y califica por tema", () => {
        const a = generarDiagnostico(1234);
        const b = generarDiagnostico(1234);
        expect(a).toEqual(b);
        const resp = a.map((e, indice) => ({ indice, respuesta: indice % 2 === 0 ? e.respuesta : "x", tiempo_ms: 1000 }));
        const r = calificarDiagnostico(a, resp);
        expect(r.total).toBe(10);
        expect(r.aciertos).toBe(5);
        expect(r.precision).toBe(50);
        expect(r.resultado_por_tema.suma).toEqual({ aciertos: 1, total: 2, precision: 50 });
    });
});

describe("números en palabras (RF-39)", () => {
    it("convierte correctamente", () => {
        expect(numeroAPalabras(0)).toBe("cero");
        expect(numeroAPalabras(16)).toBe("dieciséis");
        expect(numeroAPalabras(45)).toBe("cuarenta y cinco");
        expect(numeroAPalabras(100)).toBe("cien");
        expect(numeroAPalabras(101)).toBe("ciento uno");
        expect(numeroAPalabras(1000)).toBe("mil");
        expect(numeroAPalabras(21_000)).toBe("veintiún mil");
        expect(numeroAPalabras(31_500)).toBe("treinta y un mil quinientos");
        expect(numeroAPalabras(999_999)).toBe("novecientos noventa y nueve mil novecientos noventa y nueve");
    });
    it("tolera acentos y errores ortográficos menores", () => {
        expect(coincideTolerante("dieciseis", "dieciséis").correcta).toBe(true);
        expect(coincideTolerante("Cuarenta y sinco", "cuarenta y cinco").correcta).toBe(true);
        expect(coincideTolerante("cincuenta", "cuarenta y cinco").correcta).toBe(false);
    });
});

// PANAS-C en escala de promedios: tests/unidad/diagnostico.test.ts (P-UNIT-05)
describe("balance PANAS heredado (escala de sumas)", () => {
    it("clasifica por diferencia de al menos 4 puntos", () => {
        expect(balancePanas({ afecto_positivo: 25, afecto_negativo: 5 })).toBe("positivo");
        expect(balancePanas({ afecto_positivo: 10, afecto_negativo: 12 })).toBe("equilibrado");
        expect(balancePanas({ afecto_positivo: 6, afecto_negativo: 20 })).toBe("negativo");
    });
});
