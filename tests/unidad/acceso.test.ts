import { describe, expect, it } from "vitest";
import { crearRng } from "@numotion/core/dominio/aleatorio";
import {
    AVATARES,
    avatarDisponible,
    esAvatar,
    generarCodigoAcceso,
    ICONOS_PIN,
    normalizarCodigo,
    pinAleatorio,
    pinATexto,
} from "@numotion/core/dominio/acceso";

describe("acceso del alumno (ADR-004)", () => {
    it("el PIN usa 4 de 12 íconos", () => {
        expect(ICONOS_PIN).toHaveLength(12);
        expect(new Set(ICONOS_PIN.map((i) => i.id)).size).toBe(12);
        expect(pinATexto(["sol", "luna", "sol", "pez"])).toBe("sol-luna-sol-pez");
        expect(pinATexto(["sol", "luna", "sol"])).toBeNull();
        expect(pinATexto(["sol", "luna", "sol", "dragon"])).toBeNull();
        expect(pinATexto("sol-luna-sol-pez")).toBeNull();
    });

    it("genera PIN válidos y deterministas por semilla", () => {
        const pin = pinAleatorio(crearRng(7));
        expect(pinATexto(pin)).not.toBeNull();
        expect(pinAleatorio(crearRng(7))).toEqual(pin);
    });

    it("el código de acceso cumple el CHECK de BD y evita caracteres ambiguos", () => {
        const rng = crearRng(3);
        for (let i = 0; i < 200; i++) {
            const c = generarCodigoAcceso(rng);
            expect(c).toMatch(/^[A-Z0-9]{6}$/);
            expect(c).not.toMatch(/[01OIL]/);
        }
    });

    it("normaliza lo que teclea el alumno", () => {
        expect(normalizarCodigo("abc 123")).toBe("ABC123");
        expect(normalizarCodigo("ab-c1-23")).toBe("ABC123");
        expect(normalizarCodigo("abc12")).toBeNull();
        expect(normalizarCodigo("abc12!")).toBeNull();
    });

    it("asigna el primer avatar libre del grupo", () => {
        expect(AVATARES.length).toBeGreaterThanOrEqual(40);
        expect(new Set(AVATARES.map((a) => a.id)).size).toBe(AVATARES.length);
        expect(avatarDisponible([])).toBe("gato");
        expect(avatarDisponible(["gato", "perro"])).toBe("conejo");
        expect(avatarDisponible(AVATARES.map((a) => a.id))).toBeNull();
        expect(esAvatar("gato")).toBe(true);
        expect(esAvatar("dragon")).toBe(false);
    });
});
