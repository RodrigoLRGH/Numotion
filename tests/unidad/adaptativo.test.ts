// P-UNIT-01 (decidirNivel, tabla 02-…§3.4), índice de frustración (§3.3), estado de ventana (§3.1) y puntos (§4)
import { describe, expect, it } from "vitest";
import { decidirNivel, estadoVentana, indiceFrustracion, type EntradaAdaptativa } from "@numotion/core/dominio/adaptativo";
import { estrellas, nivelGamificacion, puntosAciertoPractica, puntosPorEjercicio } from "@numotion/core/dominio/puntos";

const bien = { correctoPrimerIntento: true, correcto: true, tiempoMs: 10_000 };
const tarde = { correctoPrimerIntento: false, correcto: true, tiempoMs: 20_000 };
const mal = { correctoPrimerIntento: false, correcto: false, tiempoMs: 40_000 };

const base: EntradaAdaptativa = {
    nivelActual: 3,
    ultimos3: [bien, tarde, bien],
    tiempoReferenciaMs: 30_000,
    estadoVentana: "neutral",
    indiceFrustracion: 0.2,
    erroresConsecutivos: 0,
    ejerciciosDesdeUltimoCambio: 5,
};

const decide = (cambios: Partial<EntradaAdaptativa>) => decidirNivel({ ...base, ...cambios });

describe("decidirNivel (RF-01, RF-21)", () => {
    it("por defecto no cambia", () => {
        expect(decide({})).toMatchObject({ nivelNuevo: 3, motivo: null });
    });

    it("R1 frustración: IF ≥ 0.6 o frustración con 2+ errores → −1, aun en enfriamiento", () => {
        expect(decide({ indiceFrustracion: 0.6, erroresConsecutivos: 0, ejerciciosDesdeUltimoCambio: 0 })).toMatchObject({ nivelNuevo: 2, motivo: "emocion" });
        expect(decide({ indiceFrustracion: 0.7, erroresConsecutivos: 3 })).toMatchObject({ nivelNuevo: 2, motivo: "combinado" });
        expect(decide({ estadoVentana: "frustracion", erroresConsecutivos: 2 })).toMatchObject({ nivelNuevo: 2, motivo: "combinado" });
        expect(decide({ estadoVentana: "frustracion", erroresConsecutivos: 1 })).toMatchObject({ nivelNuevo: 3, motivo: null });
    });

    it("R0 enfriamiento: menos de 2 ejercicios desde el último cambio bloquea R3–R5", () => {
        expect(decide({ ultimos3: [mal, mal, mal], ejerciciosDesdeUltimoCambio: 1 })).toMatchObject({ nivelNuevo: 3, motivo: null });
        expect(decide({ ultimos3: [bien, bien, bien], ejerciciosDesdeUltimoCambio: 1 })).toMatchObject({ nivelNuevo: 3, motivo: null });
    });

    it("R3 bajo desempeño: ≤ 1 correcto de 3 → −1", () => {
        expect(decide({ ultimos3: [mal, tarde, mal] })).toMatchObject({ nivelNuevo: 2, motivo: "desempeno" });
        expect(decide({ ultimos3: [mal, tarde, tarde] })).toMatchObject({ nivelNuevo: 3, motivo: null });
    });

    it("R3–R5 requieren 3 ejercicios cerrados (A-26)", () => {
        expect(decide({ ultimos3: [mal, mal] })).toMatchObject({ nivelNuevo: 3, motivo: null });
        expect(decide({ ultimos3: [bien, bien] })).toMatchObject({ nivelNuevo: 3, motivo: null });
    });

    it("R4 dominio: 3/3 al primer intento, mediana ≤ 1.2×referencia y sin frustración → +1", () => {
        expect(decide({ ultimos3: [bien, bien, bien] })).toMatchObject({ nivelNuevo: 4, motivo: "desempeno" });
        expect(decide({ ultimos3: [bien, bien, bien], estadoVentana: "desinteres" })).toMatchObject({ nivelNuevo: 4, motivo: "combinado" });
        const lento = { ...bien, tiempoMs: 37_000 };
        expect(decide({ ultimos3: [lento, lento, bien] })).toMatchObject({ nivelNuevo: 3, motivo: null }); // mediana 37 s > 36 s
        expect(decide({ ultimos3: [lento, bien, bien] })).toMatchObject({ nivelNuevo: 4 }); // mediana 10 s
        expect(decide({ ultimos3: [bien, bien, bien], estadoVentana: "frustracion" })).toMatchObject({ nivelNuevo: 3, motivo: null });
    });

    it("R5 re-enganche: desinterés y ≥ 2 de 3 correctos → +1", () => {
        expect(decide({ estadoVentana: "desinteres", ultimos3: [bien, tarde, mal] })).toMatchObject({ nivelNuevo: 4, motivo: "emocion" });
    });

    it("nunca sale de [1, 5]", () => {
        expect(decide({ nivelActual: 1, ultimos3: [mal, mal, mal] })).toMatchObject({ nivelNuevo: 1 });
        expect(decide({ nivelActual: 5, ultimos3: [bien, bien, bien] })).toMatchObject({ nivelNuevo: 5 });
        expect(decide({ nivelActual: 1, indiceFrustracion: 0.9 })).toMatchObject({ nivelNuevo: 1 });
    });

    it("devuelve las reglas evaluadas para el detalle de ajuste_dificultad", () => {
        expect(decide({ ultimos3: [mal, mal, mal] }).reglas).toContain("R3");
    });
});

describe("índice de frustración (§3.3)", () => {
    it("con cámara: 0.4·E + 0.3·errores + 0.2·inactividad + 0.1·ayudas", () => {
        expect(indiceFrustracion({ fraccionFrustracion: 1, erroresConsecutivos: 3, inactividadSeg: 60, ayudasEnEjercicio: 2 })).toBe(1);
        expect(indiceFrustracion({ fraccionFrustracion: 0.5, erroresConsecutivos: 3, inactividadSeg: 0, ayudasEnEjercicio: 0 })).toBe(0.5);
        expect(indiceFrustracion({ fraccionFrustracion: 0, erroresConsecutivos: 6, inactividadSeg: 600, ayudasEnEjercicio: 9 })).toBe(0.6); // topes
    });
    it("sin cámara se renormaliza: 0.5 / 0.33 / 0.17", () => {
        expect(indiceFrustracion({ fraccionFrustracion: null, erroresConsecutivos: 3, inactividadSeg: 0, ayudasEnEjercicio: 0 })).toBe(0.5);
        expect(indiceFrustracion({ fraccionFrustracion: null, erroresConsecutivos: 3, inactividadSeg: 60, ayudasEnEjercicio: 2 })).toBe(1);
        expect(indiceFrustracion({ fraccionFrustracion: null, erroresConsecutivos: 2, inactividadSeg: 30, ayudasEnEjercicio: 0 })).toBe(0.5);
    });
});

describe("estado de ventana (§3.1)", () => {
    const m = (estado: string, emocion = "CALM") => ({ estado, emocion });
    it("sin al menos 2 muestras con dato → sin_dato", () => {
        expect(estadoVentana([m("positivo")], 0)).toBe("sin_dato");
        expect(estadoVentana([m("sin_dato"), m("sin_dato"), m("positivo")], 0)).toBe("sin_dato");
    });
    it("modal; empate → el más negativo", () => {
        expect(estadoVentana([m("positivo"), m("positivo"), m("frustracion")], 0)).toBe("positivo");
        expect(estadoVentana([m("positivo"), m("frustracion")], 0)).toBe("frustracion");
        expect(estadoVentana([m("neutral"), m("positivo")], 0)).toBe("neutral");
    });
    it("desinterés: ≥ 80 % neutral con inactividad > 45 s o 3 SIN_ROSTRO seguidos", () => {
        const neutrales = [m("neutral"), m("neutral"), m("neutral"), m("neutral"), m("positivo")];
        expect(estadoVentana(neutrales, 46)).toBe("desinteres");
        expect(estadoVentana(neutrales, 10)).toBe("neutral");
        const sinRostro = [m("sin_dato", "SIN_ROSTRO"), m("sin_dato", "SIN_ROSTRO"), m("sin_dato", "SIN_ROSTRO"), m("neutral"), m("neutral")];
        expect(estadoVentana(sinRostro, 0)).toBe("desinteres");
    });
});

describe("puntos y gamificación (§4)", () => {
    it("10 / 7 / 5 por intento y 3 tras la guía; 0 si no acierta", () => {
        expect([1, 2, 3].map((n) => puntosPorEjercicio(true, n, false))).toEqual([10, 7, 5]);
        expect(puntosPorEjercicio(true, 4, false)).toBe(3);
        expect(puntosPorEjercicio(true, 1, true)).toBe(3);
        expect(puntosPorEjercicio(false, 1, false)).toBe(0);
    });
    it("RF-03: práctica libre da 3 / 2 / 1 por respuesta correcta según el intento; 0 si falla", () => {
        expect([1, 2, 3].map((n) => puntosAciertoPractica(true, n))).toEqual([3, 2, 1]);
        expect(puntosAciertoPractica(false, 1)).toBe(0);
    });
    it("nivel n requiere 50·n·(n−1) puntos, máximo 20", () => {
        expect([0, 99, 100, 299, 300, 600, 1000].map(nivelGamificacion)).toEqual([1, 1, 2, 2, 3, 4, 5]);
        expect(nivelGamificacion(10_000_000)).toBe(20);
    });
    it("estrellas por resultado final (A-27)", () => {
        expect([10, 9, 8.99, 7, 6.99, 0].map(estrellas)).toEqual([3, 3, 2, 2, 1, 1]);
    });
});
