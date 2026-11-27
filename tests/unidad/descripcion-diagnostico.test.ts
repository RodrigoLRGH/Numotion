// Descripción de la retroalimentación para el docente (RF-62): tiempo, temas y aspectos detectados.
import { describe, expect, it } from "vitest";
import { describirDiagnostico, duracion } from "@numotion/core/dominio/descripcion-diagnostico";

const suma = { tema: "Suma", ejercicios: 5, aciertos: 4, nivelDominio: 4, tiempoMs: 120_000 };
const resta = { tema: "Resta", ejercicios: 4, aciertos: 1, nivelDominio: 2, tiempoMs: 270_000 };

describe("duracion", () => {
    it("formatea minutos y segundos", () => {
        expect(duracion(45_000)).toBe("45 s");
        expect(duracion(390_000)).toBe("6 min 30 s");
        expect(duracion(120_000)).toBe("2 min");
    });
});

describe("describirDiagnostico", () => {
    it("tiempo total, temas, fortalezas, tema a reforzar, el más lento y el PANAS-C", () => {
        const p = describirDiagnostico({ temas: [suma, resta], estadoInicial: "positivo", afectoPositivo: 4, afectoNegativo: 1.4, observaciones: [] });
        expect(p).toEqual([
            "Resolvió el diagnóstico matemático en 6 min 30 s: 9 ejercicios de 2 temas (Suma y Resta).",
            "Su mejor desempeño fue en Suma (nivel 4 de 5); conviene reforzar Resta (nivel 2 de 5).",
            "El tema en el que más tardó por ejercicio fue Resta (1 min 8 s en promedio).",
            "En el cuestionario emocional (PANAS-C) inició el día con ánimo positivo: afecto positivo 4.0 y afecto negativo 1.4 (escala de 1 a 5).",
        ]);
    });

    it("habla de señales, no de diagnósticos, e incluye las observaciones", () => {
        const p = describirDiagnostico({ temas: [suma], estadoInicial: "frustracion", afectoPositivo: 2, afectoNegativo: 3.4, observaciones: ["AN alto y dominio bajo en suma"] });
        expect(p[1]).toBe("Mostró un nivel parecido en el tema (nivel 4 de 5).");
        expect(p).toContain("En el cuestionario emocional (PANAS-C) inició el día con señales de frustración: afecto positivo 2.0 y afecto negativo 3.4 (escala de 1 a 5).");
        expect(p.at(-1)).toBe("Aspectos detectados: AN alto y dominio bajo en suma.");
    });

    it("sin datos lo dice en lugar de inventar", () => {
        expect(describirDiagnostico({ temas: [], estadoInicial: "neutral", afectoPositivo: null, afectoNegativo: null, observaciones: [] })).toEqual([
            "No hay resultados del diagnóstico matemático de este día.",
            "No hay resultado del cuestionario emocional (PANAS-C) de este día.",
        ]);
    });
});
