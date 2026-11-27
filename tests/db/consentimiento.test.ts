// P-SEC-04 · Consentimiento del tutor (RC-08, RNF-10): OTP, aceptar (incluye la cámara, A-41), revocar y
// renovar el enlace. Sin ARCO ni auditoría: RC-07 está fuera del MVP.
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
    verConsentimiento,
} from "../../apps/api/src/modules/core/consentimiento";
import { crearAlumno, crearGrupo } from "../../apps/api/src/modules/docente/grupos";
import { enTransaccion, sql } from "./fixture";

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

const datos = (otp: string) => ({ otp, tutorNombre: "Rosa Vázquez", parentesco: "madre" });

describe("vista pública del enlace", () => {
    it("muestra datos mínimos (sin apellidos) y el correo enmascarado", async () => {
        const inv = await invitacion();
        const v = await verConsentimiento(inv.token);
        expect(v).toMatchObject({ alumno: "Emilia", grupo: "4B", docente: "Docente Tutor", estado: "pendiente" });
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

describe("aceptar y revocar (EXP-01.5, HU-03)", () => {
    it("sin consentimiento no entra; al aceptar entra y el consentimiento cubre la cámara", async () => {
        const inv = await invitacion();
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ code: "CONSENTIMIENTO_REQUERIDO", status: 403 });

        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), "10.0.0.1")).toBe("ok");
        expect(await verConsentimiento(inv.token)).toMatchObject({ estado: "vigente", parentesco: "madre" });
        const [c] = await sql`SELECT acepta_plataforma, acepta_camara, metodo_verificacion, host(ip) AS ip FROM consentimiento_tutor WHERE alumno_id = ${inv.alumnoId}`;
        expect(c).toEqual({ acepta_plataforma: true, acepta_camara: true, metodo_verificacion: "email_otp", ip: "10.0.0.1" });
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ ok: true });

        // Ya aceptado, puede volver a aceptar (p. ej. un aviso nuevo) aun con el enlace vencido
        await sql`UPDATE consentimiento_tutor SET token_expira_en = now() - interval '1 day' WHERE alumno_id = ${inv.alumnoId}`;
        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null)).toBe("ok");
    });

    it("un aviso de privacidad nuevo deja el consentimiento por renovar y bloquea la entrada", async () => {
        const inv = await invitacion();
        await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null);
        // Dentro de una transacción revertida: el aviso nuevo no debe afectar a las demás pruebas
        await enTransaccion(async (tx) => {
            expect((await tx`SELECT vigente FROM fn_consentimiento_vigente(${inv.alumnoId}::uuid)`)[0].vigente).toBe(true);
            await tx`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v-prueba', now(), '/privacidad')`;
            expect((await tx`SELECT vigente FROM fn_consentimiento_vigente(${inv.alumnoId}::uuid)`)[0].vigente).toBe(false);
        });
    });

    it("un enlace vencido no sirve para aceptar por primera vez", async () => {
        const inv = await invitacion();
        await sql`UPDATE consentimiento_tutor SET token_expira_en = now() - interval '1 minute' WHERE alumno_id = ${inv.alumnoId}`;
        expect((await verConsentimiento(inv.token))!.estado).toBe("vencido");
        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null)).toBe("token_vencido");
    });

    it("revocar cierra la sesión activa y el docente puede reinvitar", async () => {
        const inv = await invitacion();
        await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null);
        const login = await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null);
        if (!login.ok) throw new Error("no entró");
        expect(await usuarioDeToken(login.sesion.token)).not.toBeNull();

        expect(await revocarConsentimiento(inv.token, await codigo(inv.token), null)).toBe("ok");
        expect(await usuarioDeToken(login.sesion.token)).toBeNull();
        expect((await verConsentimiento(inv.token))!.estado).toBe("revocado");
        expect(await aceptarConsentimiento(inv.token, datos(await codigo(inv.token)), null)).toBe("revocado");
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ code: "CONSENTIMIENTO_REQUERIDO" });

        // Reinvitación: nuevo enlace, el viejo deja de servir para aceptar
        const nueva = await conContexto(inv.ctx, (tx) => renovarInvitacion(tx, inv.alumnoId));
        expect(nueva).toMatchObject({ tutorEmail: inv.tutorEmail });
        expect((await verConsentimiento(nueva!.token))!.estado).toBe("pendiente");
        expect(await aceptarConsentimiento(nueva!.token, datos(await codigo(nueva!.token)), null)).toBe("ok");
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ ok: true });
    });

    it("el docente ve el estado del consentimiento pero no puede aceptarlo por el tutor", async () => {
        const inv = await invitacion();
        const filas = await conContexto(inv.ctx, (tx) =>
            tx.$queryRaw<{ aceptado_en: Date | null }[]>`SELECT aceptado_en FROM consentimiento_tutor WHERE alumno_id = ${inv.alumnoId}::uuid`);
        expect(filas).toEqual([{ aceptado_en: null }]);
        await expect(conContexto(inv.ctx, (tx) =>
            tx.$executeRaw`UPDATE consentimiento_tutor SET aceptado_en = now() WHERE alumno_id = ${inv.alumnoId}::uuid`)).rejects.toThrow();
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
