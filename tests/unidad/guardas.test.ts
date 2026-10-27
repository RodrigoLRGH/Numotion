import { describe, expect, it } from "vitest";
import { decidirAcceso } from "../../src/modules/shared/servidor/guardas";

const docente = { rol: "docente" as const };
const alumno = { rol: "alumno" as const };
const listo = { panas: true, matematico: true };

describe("guardas por rol (RNF-04)", () => {
    it("las rutas públicas no requieren sesión", () => {
        expect(decidirAcceso("/", null, null)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/login", null, null)).toEqual({ tipo: "permitir" });
    });
    it("sin sesión redirige a login (páginas) o 401 (API)", () => {
        expect(decidirAcceso("/docente", null, null)).toEqual({ tipo: "redirigir", destino: "/login?siguiente=%2Fdocente" });
        expect(decidirAcceso("/api/docente/notas", null, null)).toEqual({ tipo: "noAutorizado" });
    });
    it("un alumno no accede al módulo docente", () => {
        expect(decidirAcceso("/docente/reportes", alumno, listo)).toEqual({ tipo: "redirigir", destino: "/alumno" });
        expect(decidirAcceso("/api/docente/actividades", alumno, listo)).toEqual({ tipo: "prohibido" });
    });
    it("un docente no accede al módulo alumno", () => {
        expect(decidirAcceso("/alumno", docente, null)).toEqual({ tipo: "redirigir", destino: "/docente" });
        expect(decidirAcceso("/api/alumno/ejercicio", docente, null)).toEqual({ tipo: "prohibido" });
    });
    it("con sesión, /login redirige al inicio del rol", () => {
        expect(decidirAcceso("/login", docente, null)).toEqual({ tipo: "redirigir", destino: "/docente" });
    });
});

describe("compuerta de diagnósticos (RF-63)", () => {
    it("exige PANAS-C antes que el diagnóstico matemático", () => {
        expect(decidirAcceso("/alumno", alumno, { panas: false, matematico: false })).toEqual({ tipo: "redirigir", destino: "/alumno/diagnostico/emocional" });
        expect(decidirAcceso("/alumno", alumno, { panas: true, matematico: false })).toEqual({ tipo: "redirigir", destino: "/alumno/diagnostico/matematico" });
        expect(decidirAcceso("/alumno", alumno, listo)).toEqual({ tipo: "permitir" });
    });
    it("las rutas de diagnóstico están exentas", () => {
        expect(decidirAcceso("/alumno/diagnostico/emocional", alumno, { panas: false, matematico: false })).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/api/alumno/panas", alumno, { panas: false, matematico: false })).toEqual({ tipo: "permitir" });
    });
    it("la API de ejercicios queda bloqueada sin diagnósticos", () => {
        expect(decidirAcceso("/api/alumno/ejercicio", alumno, { panas: true, matematico: false })).toEqual({ tipo: "prohibido" });
    });
});
