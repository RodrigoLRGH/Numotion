// P-ROUTE-01..03 sobre la función pura de guardas
import { describe, expect, it } from "vitest";
import { decidirAcceso, destinoTrasLogin } from "@numotion/core/guardas";

const docente = { rol: "docente" as const };
const alumno = { rol: "alumno" as const };
const listo = { panas: true, matematico: true };

describe("guardas por rol (RNF-04)", () => {
    it("las rutas públicas no requieren sesión", () => {
        expect(decidirAcceso("/", null, null)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/docente/entrar", null, null)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/alumno/entrar", null, null)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/alumno/sin-permiso", null, null)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/api/v1/auth/alumno/login", null, null)).toEqual({ tipo: "permitir" });
    });
    it("sin sesión redirige a la entrada del área (páginas) o 401 (API)", () => {
        expect(decidirAcceso("/docente", null, null)).toEqual({ tipo: "redirigir", destino: "/docente/entrar?next=%2Fdocente" });
        expect(decidirAcceso("/alumno/perfil", null, null)).toEqual({ tipo: "redirigir", destino: "/alumno/entrar?next=%2Falumno%2Fperfil" });
        expect(decidirAcceso("/api/v1/docente/grupos", null, null)).toEqual({ tipo: "noAutorizado" });
    });
    it("un alumno no accede al módulo docente", () => {
        expect(decidirAcceso("/docente/reportes", alumno, listo)).toEqual({ tipo: "redirigir", destino: "/alumno" });
        expect(decidirAcceso("/api/v1/docente/actividades", alumno, listo)).toEqual({ tipo: "prohibido" });
    });
    it("un docente no accede al módulo alumno", () => {
        expect(decidirAcceso("/alumno", docente, null)).toEqual({ tipo: "redirigir", destino: "/docente" });
        expect(decidirAcceso("/api/v1/alumno/intentos", docente, null)).toEqual({ tipo: "prohibido" });
    });
    it("no confunde prefijos parecidos", () => {
        expect(decidirAcceso("/docentes-info", null, null)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/alumnos", null, null)).toEqual({ tipo: "permitir" });
    });
    it("con sesión, las páginas de entrada redirigen al inicio del rol", () => {
        expect(decidirAcceso("/docente/entrar", docente, null)).toEqual({ tipo: "redirigir", destino: "/docente" });
        expect(decidirAcceso("/alumno/entrar", alumno, null)).toEqual({ tipo: "redirigir", destino: "/alumno" });
    });
});

describe("compuerta de diagnósticos (RF-63)", () => {
    it("exige PANAS-C antes que el diagnóstico matemático", () => {
        expect(decidirAcceso("/alumno", alumno, { panas: false, matematico: false })).toEqual({ tipo: "redirigir", destino: "/alumno/diagnostico/emocional" });
        expect(decidirAcceso("/alumno", alumno, { panas: true, matematico: false })).toEqual({ tipo: "redirigir", destino: "/alumno/diagnostico/matematico" });
        expect(decidirAcceso("/alumno", alumno, listo)).toEqual({ tipo: "permitir" });
    });
    it("las rutas de diagnóstico y el envío de frames están exentos", () => {
        const nada = { panas: false, matematico: false };
        expect(decidirAcceso("/alumno/diagnostico/emocional", alumno, nada)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/api/v1/alumno/diagnostico/panas", alumno, nada)).toEqual({ tipo: "permitir" });
        expect(decidirAcceso("/api/v1/alumno/emociones/frame", alumno, nada)).toEqual({ tipo: "permitir" });
    });
    it("la API del alumno responde DIAGNOSTICOS_PENDIENTES", () => {
        expect(decidirAcceso("/api/v1/alumno/panel", alumno, { panas: true, matematico: false })).toEqual({ tipo: "diagnosticosPendientes" });
    });
});

describe("destino tras login", () => {
    it("solo acepta rutas del área del rol", () => {
        expect(destinoTrasLogin("docente", "/docente/reportes?x=1")).toBe("/docente/reportes?x=1");
        expect(destinoTrasLogin("docente", "/alumno")).toBe("/docente");
        expect(destinoTrasLogin("docente", "https://malo.com/docente")).toBe("/docente");
        expect(destinoTrasLogin("docente", "/docentex")).toBe("/docente");
        expect(destinoTrasLogin("alumno", undefined)).toBe("/alumno");
    });
});
