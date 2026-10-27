// P-SEC-05 · cabeceras de seguridad (RI-09)
import { describe, expect, it } from "vitest";
import { cabecerasSeguridad } from "../../src/modules/shared/servidor/cabeceras";

describe("cabeceras de seguridad", () => {
    it("permiten la cámara solo al propio origen y prohíben incrustar la app", () => {
        const h = cabecerasSeguridad(true);
        expect(h["Permissions-Policy"]).toContain("camera=(self)");
        expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
        expect(h["Content-Security-Policy"]).toContain("connect-src 'self'");
        expect(h["X-Content-Type-Options"]).toBe("nosniff");
    });
    it("HSTS solo en producción (en local no hay HTTPS)", () => {
        expect(cabecerasSeguridad(true)["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
        expect(cabecerasSeguridad(false)["Strict-Transport-Security"]).toBeUndefined();
    });
});
