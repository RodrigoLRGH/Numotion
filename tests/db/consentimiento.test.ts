// P-SEC-04 · Consentimiento del tutor: OTP, aceptar, cámara separada, revocar, ARCO, renovar enlace.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { loginAlumno, registrarDocente, usuarioDeToken } from "../../apps/api/src/modules/core/auth";
import { bandejaMemoria } from "../../apps/api/src/infra/correo";
import { conContexto } from "../../apps/api/src/infra/db";
import {
    aceptarConsentimiento,
    enviarCodigo,
    enviarInvitacion,
    renovarInvitacion,
    revocarConsentimiento,
    solicitarArco,
    verConsentimiento,
} from "../../apps/api/src/modules/core/consentimiento";
import { crearAlumno, crearGrupo } from "../../apps/api/src/modules/docente/grupos";
import { sql } from "./fixture";

beforeEach(() => {
    bandejaMemoria.length = 0;
});

async function invitacion() {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad')
              ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente Tutor", `tutor-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctx = { rol: "docente" as const, id: docente.id };
    const grupo = await conContexto(ctx, (tx) => crearGrupo(tx, docente.id, { nombre: "4B", grado: 4, cicloEscolar: "2026-2027" }));
    const tutorEmail = `rosa.${randomUUID().slice(0, 8)}@correo.mx`;
    const alta = await conContexto(ctx, (tx) =>
        crearAlumno(tx, grupo.id, { nombre: "Emilia Sofía", apellidos: "Vázquez", pin: ["sol", "sol", "sol", "sol"], tutorNombre: "Rosa", tutorEmail }));
    if (!alta.ok) throw new Error(alta.message);
    return { ctx, grupo, alumnoId: alta.alumno.id, token: alta.invitacion.token, tutorEmail };
}

/** Pide un código y lo lee de la bandeja en memoria. Permite pedir otro sin esperar el minuto. */
async function codigo(token: string): Promise<string> {
    await sql`UPDATE consentimiento_tutor SET otp_enviado_en = NULL WHERE otp_enviado_en IS NOT NULL`;
    expect(await enviarCodigo(token)).toBe("ok");
    const correo = bandejaMemoria.at(-1)!;
    return correo.texto.match(/\b(\d{6})\b/)![1];
}

const datos = (otp: string, aceptaCamara = false) => ({ otp, tutorNombre: "Rosa Vázquez", parentesco: "madre", aceptaCamara });

describe("vista pública del enlace", () => {
    it("muestra datos mínimos (sin apellidos) y el correo enmascarado", async () => {
        const inv = await invitacion();
        const v = await verConsentimiento(inv.token);
        expect(v).toMatchObject({ alumno: "Emilia", grupo: "4B", docente: "Docente Tutor", estado: "pendiente", aceptaCamara: false });
        expect(v!.correo).toMatch(/^r\*+\w@correo\.mx$/);
        expect(JSON.stringify(v)).not.toContain("Vázquez");
        expect(JSON.stringify(v)).not.toContain(inv.tutorEmail);
        expect(await verConsentimiento("token-que-no-existe")).toBeNull();
    });
});

describe("código de verificación (OTP)", () => {
    it("se envía al correo del tutor, máximo uno por minuto", async () => {
        const inv = await invitacion();
        expect(await enviarCodigo(inv.token)).toBe("ok");
        expect(bandejaMemoria).toHaveLength(1);
        expect(bandejaMemoria[0].para).toBe(inv.tutorEmail);
        expect(bandejaMemoria[0].texto).toMatch(/\b\d{6}\b/);
        expect(await enviarCodigo(inv.token)).toBe("espera");
        expect(await enviarCodigo("token-inventado")).toBe("token_invalido");
    });

    it("se invalida tras 5 intentos fallidos y es de un solo uso", async () => {
        const inv = await invitacion();
        const otp = await codigo(inv.token);
        const malo = otp === "000000" ? "111111" : "000000";
        for (let i = 0; i < 5; i++) expect(await aceptarConsentimiento(inv.token, datos(malo), null)).toBe("otp_invalido");
        expect(await aceptarConsentimiento(inv.token, datos(otp), null)).toBe("otp_vencido");

        const nuevo = await codigo(inv.token);
        expect(await aceptarConsentimiento(inv.token, datos(nuevo), null)).toBe("ok");
        expect(await revocarConsentimiento(inv.token, nuevo, null)).toBe("otp_vencido"); // ya se usó
    });
});

describe("aceptar, cámara separada y revocar (EXP-01.5, HU-03)", () => {
    it("sin consentimiento no entra; al aceptar sin cámara entra con la cámara desactivada", async () => {
        const inv = await invitacion();
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ code: "CONSENTIMIENTO_REQUERIDO" });

        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token), false), "10.0.0.1")).toBe("ok");
        expect(await verConsentimiento(inv.token)).toMatchObject({ estado: "vigente", aceptaCamara: false, parentesco: "madre" });
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ ok: true, camaraPermitida: false });

        // El tutor cambia de opinión sobre la cámara sin revocar la plataforma, aun con el enlace vencido
        await sql`UPDATE consentimiento_tutor SET token_expira_en = now() - interval '1 day' WHERE alumno_id = ${inv.alumnoId}`;
        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token), true), null)).toBe("ok");
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ ok: true, camaraPermitida: true });
    });

    it("un enlace vencido no sirve para aceptar por primera vez", async () => {
        const inv = await invitacion();
        await sql`UPDATE consentimiento_tutor SET token_expira_en = now() - interval '1 minute' WHERE alumno_id = ${inv.alumnoId}`;
        expect((await verConsentimiento(inv.token))!.estado).toBe("vencido");
        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null)).toBe("token_vencido");
    });

    it("revocar cierra la sesión activa, registra la solicitud de borrado y el docente puede reinvitar", async () => {
        const inv = await invitacion();
        await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null);
        const login = await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null);
        if (!login.ok) throw new Error("no entró");
        expect(await usuarioDeToken(login.sesion.token)).not.toBeNull();

        expect(await revocarConsentimiento(inv.token, await codigo(inv.token), null)).toBe("ok");
        expect(await usuarioDeToken(login.sesion.token)).toBeNull();
        expect((await verConsentimiento(inv.token))!.estado).toBe("revocado");
        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null)).toBe("revocado");
        const [s] = await sql`SELECT tipo, atendida_en FROM solicitud_arco WHERE alumno_id = ${inv.alumnoId}`;
        expect(s).toEqual({ tipo: "revocacion", atendida_en: null });

        // Reinvitación: nuevo enlace, el viejo deja de servir para aceptar
        const nueva = await conContexto(inv.ctx, (tx) => renovarInvitacion(tx, inv.alumnoId));
        expect(nueva).toMatchObject({ tutorEmail: inv.tutorEmail });
        expect((await verConsentimiento(nueva!.token))!.estado).toBe("pendiente");
        expect(await aceptarConsentimiento(nueva!.token, datos(await codigo(nueva!.token)), null)).toBe("ok");
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ ok: true });
    });

    it("solicitud ARCO y auditoría de cada evento", async () => {
        const inv = await invitacion();
        await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null);
        expect(await solicitarArco(inv.token, await codigo(inv.token), "acceso", "Quiero saber qué datos tienen", null)).toBe("ok");
        const solicitudes = await sql`SELECT tipo, detalle FROM solicitud_arco WHERE alumno_id = ${inv.alumnoId}`;
        expect(solicitudes).toEqual([{ tipo: "acceso", detalle: "Quiero saber qué datos tienen" }]);
        const eventos = await sql`SELECT accion FROM auditoria_acceso WHERE recurso_id = ${inv.alumnoId} ORDER BY id`;
        expect(eventos.map((e) => e.accion)).toEqual(["consentimiento", "arco"]);
        // El docente del grupo ve la solicitud
        expect(await conContexto(inv.ctx, (tx) => tx.$queryRaw<unknown[]>`SELECT tipo FROM solicitud_arco WHERE alumno_id = ${inv.alumnoId}::uuid`)).toHaveLength(1);
    });

    it("otro docente no puede generar enlaces para alumnos ajenos", async () => {
        const inv = await invitacion();
        const { docente: otro } = await registrarDocente("Otro", `otro-${randomUUID()}@escuela.mx`, "contraseña-segura");
        expect(await conContexto({ rol: "docente", id: otro.id }, (tx) => renovarInvitacion(tx, inv.alumnoId))).toBeNull();
    });

    it("la invitación por correo lleva el enlace y no los apellidos", async () => {
        expect(await enviarInvitacion("t@correo.mx", "Emilia", "https://app/consentimiento/abc", new Date("2026-11-03"))).toBe(true);
        expect(bandejaMemoria[0]).toMatchObject({ para: "t@correo.mx" });
        expect(bandejaMemoria[0].texto).toContain("https://app/consentimiento/abc");
    });
});
