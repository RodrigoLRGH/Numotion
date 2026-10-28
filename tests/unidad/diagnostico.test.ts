// P-UNIT-05 (PANAS-C) y P-UNIT-06 (diagnóstico matemático escalonado)
import { describe, expect, it } from "vitest";
import { calcularPanas, esValorPanas, estadoInicialDesdePanas, ESCALA_PANAS } from "@numotion/core/dominio/panas";
import { nivelDominio, siguienteNivel, type Modo, type RespuestaNivel } from "@numotion/core/dominio/diagnostico";

const r = (nivel: number, correcta: boolean): RespuestaNivel => ({ nivel, correcta });

describe("PANAS-C (RF-54, P-UNIT-05)", () => {
    it("AP y AN son el promedio 1–5 de cada subescala, a dos decimales", () => {
        const respuestas = [
            ...[5, 4, 4, 3, 3].map((valor) => ({ afecto: "positivo" as const, valor })),
            ...[1, 2, 1, 2, 2].map((valor) => ({ afecto: "negativo" as const, valor })),
        ];
        expect(calcularPanas(respuestas)).toEqual({ afectoPositivo: 3.8, afectoNegativo: 1.6 });
        expect(calcularPanas([
            { afecto: "positivo", valor: 1 }, { afecto: "positivo", valor: 2 }, { afecto: "positivo", valor: 2 },
            { afecto: "negativo", valor: 5 },
        ])).toEqual({ afectoPositivo: 1.67, afectoNegativo: 5 });
    });

    it("la escala tiene 5 caras con valores 1..5", () => {
        expect(ESCALA_PANAS.map((e) => e.valor)).toEqual([1, 2, 3, 4, 5]);
        expect(esValorPanas(3)).toBe(true);
        expect(esValorPanas(0)).toBe(false);
        expect(esValorPanas(2.5)).toBe(false);
    });

    it("estado inicial según 02-…§3.2 (mismo resultado que fn_estado_inicial)", () => {
        expect(estadoInicialDesdePanas(4, 3)).toBe("frustracion");
        expect(estadoInicialDesdePanas(4, 2)).toBe("positivo");
        expect(estadoInicialDesdePanas(2, 2)).toBe("desinteres");
        expect(estadoInicialDesdePanas(3, 2.6)).toBe("neutral");
        expect(estadoInicialDesdePanas(3.5, 2.5)).toBe("neutral");
    });
});

describe("diagnóstico matemático escalonado (RF-55, P-UNIT-06)", () => {
    const completo: Modo = { tipo: "completo" };

    it("empieza en nivel 2, sube al acertar y baja al fallar", () => {
        expect(siguienteNivel([], completo)).toBe(2);
        expect(siguienteNivel([r(2, true)], completo)).toBe(3);
        expect(siguienteNivel([r(2, false)], completo)).toBe(1);
    });

    it("hace entre 3 y 5 preguntas por tema", () => {
        // Sube hasta 5 y la acierta: 2,3,4,5 y termina (5 ya preguntado)
        const sube = [r(2, true), r(3, true), r(4, true), r(5, true)];
        expect(siguienteNivel(sube.slice(0, 3), completo)).toBe(5);
        expect(siguienteNivel(sube, completo)).toBeNull();
        expect(nivelDominio(sube, completo)).toBe(5);

        // Falla todo: 2,1,1 y termina
        const baja = [r(2, false), r(1, false)];
        expect(siguienteNivel(baja, completo)).toBe(1);
        expect(siguienteNivel([...baja, r(1, false)], completo)).toBeNull();
        expect(nivelDominio([...baja, r(1, false)], completo)).toBe(1);

        // Nunca más de 5
        const oscila = [r(2, true), r(3, false), r(2, true), r(3, false), r(2, true)];
        expect(siguienteNivel(oscila, completo)).toBeNull();
    });

    it("termina al oscilar entre dos niveles ya preguntados", () => {
        const h = [r(2, true), r(3, true), r(4, false)];
        expect(siguienteNivel(h, completo)).toBeNull(); // el siguiente (3) ya se preguntó
        expect(nivelDominio(h, completo)).toBe(3);
    });

    it("dominio = nivel más alto acertado sin fallar el inmediato inferior; 1 si no acierta", () => {
        // El 2 se falló y luego se acertó; el inferior (1) no se falló → cuenta el 2
        expect(nivelDominio([r(2, false), r(1, true), r(2, true)], completo)).toBe(2);
        expect(nivelDominio([r(2, true), r(3, false), r(2, true)], completo)).toBe(2);
        expect(nivelDominio([r(2, false), r(1, false), r(1, false)], completo)).toBe(1);
        // Acertó el 3 pero había fallado el 2 → el 3 no cuenta; queda el 2
        expect(nivelDominio([r(2, false), r(1, true), r(2, true), r(3, true)], completo)).toBe(2);
        // Acertó el 4 sin haber fallado el 3 → cuenta aunque falló el 2
        expect(nivelDominio([r(2, false), r(1, true), r(2, true), r(3, true), r(4, true)], completo)).toBe(4);
        expect(nivelDominio([], completo)).toBe(1);
    });

    it("versión corta (EXP-02.6): una pregunta en el último nivel de dominio", () => {
        const corto: Modo = { tipo: "corto", nivel: 4 };
        expect(siguienteNivel([], corto)).toBe(4);
        expect(siguienteNivel([r(4, true)], corto)).toBeNull();
        expect(nivelDominio([r(4, true)], corto)).toBe(4);
        expect(nivelDominio([r(4, false)], corto)).toBe(3);
        expect(nivelDominio([r(1, false)], { tipo: "corto", nivel: 1 })).toBe(1);
    });
});
