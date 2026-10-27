// P-SEC-01, P-SEC-02, P-SEC-04 · servicios de autenticación y alta de alumnos contra PostgreSQL.
// A diferencia de las demás pruebas de BD, estos servicios confirman sus transacciones:
// cada prueba usa correos únicos y la base se recrea en cada corrida.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    grupoParaEntrar,
    loginAlumno,
    loginDocente,
    registrarDocente,
    usuarioDeToken,
    cerrarSesionToken,
} from "../../src/modules/shared/servidor/auth";
import { conContexto } from "../../src/modules/shared/servidor/db";
import { alumnosDelGrupo, crearAlumno, crearGrupo, gruposDelDocente } from "../../src/modules/docente/servidor/grupos";
import { sql } from "./fixture";

const PASSWORD = "contraseña-segura";

async function asegurarAviso() {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad')
              ON CONFLICT DO NOTHING`;
}

async function docenteConGrupo() {
    await asegurarAviso();
    const email = `docente-${randomUUID()}@escuela.mx`;
    const { docente, sesion } = await registrarDocente("Maestra Prueba", email, PASSWORD);
    const ctx = { rol: "docente" as const, id: docente.id };
    const grupo = await conContexto(ctx, (tx) => crearGrupo(tx, docente.id, { nombre: "3A", grado: 3, cicloEscolar: "2026-2027" }));
    return { docente, sesion, email, ctx, grupo };
}

/** Simula que el tutor aceptó (el flujo público con OTP llega en T-03-01-10). */
async function aceptarConsentimiento(alumnoId: string, camara = false) {
    await sql`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true, acepta_camara = ${camara}
              WHERE alumno_id = ${alumnoId}`;
}

describe("docente (P-SEC-02)", () => {
    it("registra, inicia sesión y la sesión resuelve al docente", async () => {
        const { docente, email, sesion } = await docenteConGrupo();
        expect(await usuarioDeToken(sesion.token)).toEqual({ id: docente.id, nombre: "Maestra Prueba", rol: "docente" });

        const r = await loginDocente(email.toUpperCase(), PASSWORD, "127.0.0.1");
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        await cerrarSesionToken(r.sesion.token);
        expect(await usuarioDeToken(r.sesion.token)).toBeNull();
    });

    it("rechaza contraseña incorrecta y bloquea 15 min tras 10 fallos", async () => {
        const { email } = await docenteConGrupo();
        for (let i = 0; i < 10; i++) {
            expect(await loginDocente(email, "mala", null)).toMatchObject({ ok: false, code: "CREDENCIALES_INVALIDAS", status: 401 });
        }
        // Bloqueada incluso con la contraseña correcta
        expect(await loginDocente(email, PASSWORD, null)).toMatchObject({ ok: false, code: "CUENTA_BLOQUEADA", status: 423 });
    });

    it("un correo inexistente responde igual que una contraseña mala", async () => {
        expect(await loginDocente(`nadie-${randomUUID()}@x.mx`, PASSWORD, null)).toMatchObject({ code: "CREDENCIALES_INVALIDAS" });
    });

    it("rechaza un correo duplicado", async () => {
        const { email } = await docenteConGrupo();
        await expect(registrarDocente("Otra", email, PASSWORD)).rejects.toThrow("EMAIL_DUPLICADO");
    });

    it("una sesión inventada no vale", async () => {
        expect(await usuarioDeToken("token-inventado")).toBeNull();
        expect(await usuarioDeToken(undefined)).toBeNull();
    });
});

describe("alta de alumnos y aislamiento entre docentes (P-SEC-01)", () => {
    it("crea el grupo con código, asigna avatar libre y deja el consentimiento pendiente", async () => {
        const { ctx, grupo } = await docenteConGrupo();
        expect(grupo.codigoAcceso).toMatch(/^[A-Z2-9]{6}$/);
        const alta = await conContexto(ctx, (tx) =>
            crearAlumno(tx, grupo.id, { nombre: "Ana María", apellidos: "López", tutorNombre: "Rosa López", tutorEmail: "rosa@correo.mx" }));
        expect(alta.ok).toBe(true);
        if (!alta.ok) return;
        expect(alta.alumno.avatar).toBe("gato");
        expect(alta.pin).toHaveLength(4);
        expect(alta.invitacion.token.length).toBeGreaterThan(30);

        const lista = await conContexto(ctx, (tx) => alumnosDelGrupo(tx, grupo.id));
        expect(lista).toEqual([expect.objectContaining({ nombre: "Ana María", estadoConsentimiento: "pendiente", aceptaCamara: false })]);
        expect((await conContexto(ctx, gruposDelDocente))[0].alumnos).toBe(1);

        const repetido = await conContexto(ctx, (tx) =>
            crearAlumno(tx, grupo.id, { nombre: "Beto", apellidos: "", avatar: "gato", tutorNombre: "Tutor", tutorEmail: "t@correo.mx" }));
        expect(repetido).toMatchObject({ ok: false, status: 409 });
    });

    it("otro docente no ve ni modifica el grupo", async () => {
        const a = await docenteConGrupo();
        const b = await docenteConGrupo();
        expect(await conContexto(b.ctx, (tx) => alumnosDelGrupo(tx, a.grupo.id))).toBeNull();
        expect(await conContexto(b.ctx, (tx) =>
            crearAlumno(tx, a.grupo.id, { nombre: "Intruso", apellidos: "", tutorNombre: "X", tutorEmail: "x@x.mx" }))).toMatchObject({ ok: false, status: 404 });
        expect((await conContexto(b.ctx, gruposDelDocente)).map((g) => g.id)).toEqual([b.grupo.id]);
    });
});

describe("alumno: código + avatar + PIN (ADR-004) y consentimiento (P-SEC-04)", () => {
    async function alumnoListo(pin = ["sol", "luna", "pez", "sol"]) {
        const { ctx, grupo } = await docenteConGrupo();
        const alta = await conContexto(ctx, (tx) =>
            crearAlumno(tx, grupo.id, { nombre: "Luis Ramón", apellidos: "Pérez", pin, tutorNombre: "Tutor", tutorEmail: "t@correo.mx" }));
        if (!alta.ok) throw new Error(alta.message);
        return { grupo, alumnoId: alta.alumno.id, pin };
    }

    it("el código muestra avatares con nombre corto, sin apellidos", async () => {
        const { grupo, alumnoId } = await alumnoListo();
        const g = await grupoParaEntrar(grupo.codigoAcceso.toLowerCase());
        expect(g).toEqual({ grupoId: grupo.id, alumnos: [{ id: alumnoId, avatar: "gato", nombreCorto: "Luis" }], iconosPin: expect.any(Array) });
        expect(JSON.stringify(g)).not.toContain("Pérez");
        expect(await grupoParaEntrar("ZZZZZZ")).toBeNull();
    });

    it("sin consentimiento vigente no entra aunque el PIN sea correcto", async () => {
        const { grupo, alumnoId, pin } = await alumnoListo();
        expect(await loginAlumno(grupo.id, alumnoId, pin, null)).toMatchObject({ ok: false, code: "CONSENTIMIENTO_REQUERIDO", status: 403 });
    });

    it("entra con PIN correcto, recibe la sesión del día y la pierde al revocar el consentimiento", async () => {
        const { grupo, alumnoId, pin } = await alumnoListo();
        await aceptarConsentimiento(alumnoId, true);
        const r = await loginAlumno(grupo.id, alumnoId, pin, "127.0.0.1");
        expect(r).toMatchObject({ ok: true, camaraPermitida: true, alumno: { id: alumnoId, avatar: "gato" } });
        if (!r.ok) return;
        expect(r.sesionId).toMatch(/^[0-9a-f-]{36}$/);
        expect(await usuarioDeToken(r.sesion.token)).toEqual({
            id: alumnoId, nombre: "Luis Ramón", rol: "alumno", grupoId: grupo.id, aceptaCamara: true,
        });

        await sql`UPDATE consentimiento_tutor SET revocado_en = now() WHERE alumno_id = ${alumnoId}`;
        expect(await usuarioDeToken(r.sesion.token)).toBeNull();
    });

    it("bloquea 5 min tras 5 PIN incorrectos y rechaza PIN mal formados", async () => {
        const { grupo, alumnoId, pin } = await alumnoListo();
        await aceptarConsentimiento(alumnoId);
        expect(await loginAlumno(grupo.id, alumnoId, ["sol"], null)).toMatchObject({ code: "CREDENCIALES_INVALIDAS" });
        for (let i = 0; i < 4; i++) {
            expect(await loginAlumno(grupo.id, alumnoId, ["luna", "luna", "luna", "luna"], null)).toMatchObject({ code: "CREDENCIALES_INVALIDAS" });
        }
        expect(await loginAlumno(grupo.id, alumnoId, pin, null)).toMatchObject({ ok: false, code: "CUENTA_BLOQUEADA", status: 423 });
    });

    it("no entra con el grupo de otro docente", async () => {
        const uno = await alumnoListo();
        const otro = await alumnoListo();
        await aceptarConsentimiento(uno.alumnoId);
        expect(await loginAlumno(otro.grupo.id, uno.alumnoId, uno.pin, null)).toMatchObject({ code: "CREDENCIALES_INVALIDAS" });
    });
});
