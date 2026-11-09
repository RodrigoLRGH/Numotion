import { describe, expect, it } from "vitest";
import { ajustarNivel, nivelInicial, NIVEL_MAX, NIVEL_MIN } from "@numotion/core/dominio/dificultad";
import { detectarFrustracion } from "@numotion/core/dominio/frustracion";

const ok = { es_correcta: true, numero_intento: 1 };
const mal = { es_correcta: false, numero_intento: 3 };

describe("nivelInicial (RF-57)", () => {
    it("mapea precisión del diagnóstico a nivel", () => {
        expect(nivelInicial(95, "positivo")).toBe(4);
        expect(nivelInicial(75, "equilibrado")).toBe(3);
        expect(nivelInicial(50, null)).toBe(2);
        expect(nivelInicial(10, null)).toBe(1);
        expect(nivelInicial(null, null)).toBe(2);
    });
    it("baja un nivel si el PANAS es negativo sin salir del rango", () => {
        expect(nivelInicial(95, "negativo")).toBe(3);
        expect(nivelInicial(0, "negativo")).toBe(NIVEL_MIN);
    });
});

describe("ajustarNivel (RF-01, RF-21)", () => {
    it("sube tras 3 aciertos al primer intento sin emoción negativa", () => {
        expect(ajustarNivel(2, [ok, ok, ok], "HAPPY")).toBe(3);
    });
    it("no sube si la emoción es negativa", () => {
        expect(ajustarNivel(2, [ok, ok, ok], "ANGRY")).toBe(2);
    });
    it("baja tras 2 ejercicios fallidos", () => {
        expect(ajustarNivel(3, [mal, mal], null)).toBe(2);
    });
    it("baja con un fallo y emoción negativa", () => {
        expect(ajustarNivel(3, [mal, ok], "CONFUSED")).toBe(2);
    });
    it("respeta el rango 1..5", () => {
        expect(ajustarNivel(NIVEL_MAX, [ok, ok, ok], null)).toBe(NIVEL_MAX);
        expect(ajustarNivel(NIVEL_MIN, [mal, mal], null)).toBe(NIVEL_MIN);
    });
});

describe("detectarFrustracion (RF-16)", () => {
    const base = { erroresConsecutivos: 0, intentosEjercicioActual: 0, emocionesRecientes: [], minutosDesdeUltimaAlerta: null };
    it("alerta con 2 errores y emoción negativa", () => {
        expect(detectarFrustracion({ ...base, erroresConsecutivos: 2, emocionesRecientes: ["ANGRY"] }).alerta).toBe(true);
    });
    it("alerta al agotar 3 intentos", () => {
        expect(detectarFrustracion({ ...base, intentosEjercicioActual: 3 }).alerta).toBe(true);
    });
    it("no alerta con 2 errores y emoción positiva", () => {
        expect(detectarFrustracion({ ...base, erroresConsecutivos: 2, emocionesRecientes: ["HAPPY"] }).alerta).toBe(false);
    });
    it("no repite alertas en menos de 5 minutos", () => {
        expect(detectarFrustracion({ ...base, intentosEjercicioActual: 3, minutosDesdeUltimaAlerta: 2 }).alerta).toBe(false);
    });
});
