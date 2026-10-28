import { describe, expect, it } from "vitest";
import { TIPOS_INTERACCION, TIPOS_POR_TEMA, tiposDeTema } from "../../src/modules/shared/dominio/catalogo";
import { codificarCursor, decodificarCursor } from "../../src/modules/shared/dominio/cursor";

describe("catálogo de tipos por tema (A-25)", () => {
    it("cada tema del catálogo de BD tiene al menos un tipo y todos existen en el enum", () => {
        const enumBd = new Set(TIPOS_INTERACCION.map((t) => t.id));
        for (const clave of ["numeros", "suma", "resta", "multiplicacion", "division", "geometria", "fracciones"]) {
            expect(tiposDeTema(clave).length, clave).toBeGreaterThan(0);
            for (const t of TIPOS_POR_TEMA[clave]) expect(enumBd.has(t)).toBe(true);
        }
        expect(tiposDeTema("inexistente")).toEqual([]);
    });
    it("cubre los tipos de los RF: 39, 40, 41, 42 y 44", () => {
        const todos = new Set(Object.values(TIPOS_POR_TEMA).flat());
        for (const t of ["numero_a_palabras", "identificar_numero", "suma_figuras", "completar_operacion", "colorear_figura"]) expect(todos.has(t as never)).toBe(true);
    });
});

describe("cursor", () => {
    it("ida y vuelta; basura → null", () => {
        const c = codificarCursor({ orden: "2026-10-27T10:00:00.000Z", id: "abc" });
        expect(decodificarCursor(c)).toEqual({ orden: "2026-10-27T10:00:00.000Z", id: "abc" });
        expect(decodificarCursor("no-es-un-cursor")).toBeNull();
        expect(decodificarCursor(undefined)).toBeNull();
        expect(decodificarCursor(Buffer.from('[1,2]').toString("base64url"))).toBeNull();
    });
});
