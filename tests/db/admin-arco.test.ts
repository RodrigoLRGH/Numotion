// P-SEC-07 · Administrador que atiende solicitudes ARCO y revocaciones (RC-07, RC-08, RNF-10):
// acceso propio, bandeja con plazo de 20 días hábiles, respuesta al tutor, anonimización y auditoría.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { atenderSolicitud, avisarTutor, solicitudesArco } from "../../apps/api/src/modules/admin/arco";
import { hashSecreto, loginAdmin, loginAlumno, registrarDocente, usuarioDeToken } from "../../apps/api/src/modules/core/auth";
import { bandejaMemoria } from "../../apps/api/src/infra/correo";
import { conContexto } from "../../apps/api/src/infra/db";
import { aceptarConsentimiento, enviarCodigo, revocarConsentimiento, solicitarArco } from "../../apps/api/src/modules/core/consentimiento";
import { crearAlumno, crearGrupo } from "../../apps/api/src/modules/docente/grupos";
import { sql } from "./fixture";

beforeEach(() => {
    bandejaMemoria.length = 0;
});

async function alumnoConPermiso() {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad') ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente ARCO", `arco-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctx = { rol: "docente" as const, id: docente.id };
    const grupo = await conContexto(ctx, (tx) => crearGrupo(tx, docente.id, { nombre: "5C", grado: 5, cicloEscolar: "2026-2027" }));
    const tutorEmail = `tutor.${randomUUID().slice(0, 8)}@correo.mx`;
    const alta = await conContexto(ctx, (tx) =>
        crearAlumno(tx, grupo.id, { nombre: "Mateo", apellidos: "Ruiz", pin: ["sol", "sol", "sol", "sol"], tutorNombre: "Elena", tutorEmail }));
    if (!alta.ok) throw new Error(alta.message);
    const token = alta.invitacion.token;
    const codigo = async () => {
        await sql`UPDATE consentimiento_tutor SET otp_enviado_en = NULL WHERE otp_enviado_en IS NOT NULL`;
        expect(await enviarCodigo(token)).toBe("ok");
        return bandejaMemoria.at(-1)!.texto.match(/\b(\d{6})\b/)![1];
    };
    expect(await aceptarConsentimiento(token, { otp: await codigo(), tutorNombre: "Elena Ruiz", parentesco: "madre", aceptaCamara: true }, null)).toBe("ok");
    return { ctx, grupo, alumnoId: alta.alumno.id, token, tutorEmail, codigo };
}

async function crearAdmin() {
    const email = `admin-${randomUUID().slice(0, 8)}@escuela.mx`;
    const [a] = await sql`INSERT INTO administrador (nombre, email, password_hash) VALUES ('Ada Admin', ${email}, ${await hashSecreto("clave-admin-segura")}) RETURNING id`;
    return { id: a.id as string, email, ctx: { rol: "admin" as const, id: a.id as string } };
}

describe("acceso del administrador", () => {
    it("entra con su contraseña, la sesión resuelve el rol admin y queda auditado", async () => {
        const admin = await crearAdmin();
        expect(await loginAdmin(admin.email, "otra-clave", null)).toMatchObject({ ok: false, code: "CREDENCIALES_INVALIDAS" });
        const r = await loginAdmin(admin.email, "clave-admin-segura", "10.0.0.1");
        if (!r.ok) throw new Error("no entró");
        expect(await usuarioDeToken(r.sesion.token)).toMatchObject({ id: admin.id, rol: "admin", nombre: "Ada Admin" });
        const eventos = await sql`SELECT accion, actor_rol FROM auditoria_acceso WHERE actor_id = ${admin.id} ORDER BY id`;
        expect(eventos).toEqual([{ accion: "login_fallido", actor_rol: "admin" }, { accion: "login", actor_rol: "admin" }]);
    });
    it("un correo de docente no sirve para entrar como administrador", async () => {
        const email = `doc-${randomUUID()}@escuela.mx`;
        await registrarDocente("Docente Normal", email, "contraseña-segura");
        expect(await loginAdmin(email, "contraseña-segura", null)).toMatchObject({ ok: false });
    });
});

describe("bandeja y atención de solicitudes ARCO", () => {
    it("el plazo es de 20 días hábiles", async () => {
        // Viernes 27-nov-2026 → 4 semanas hábiles después: viernes 25-dic-2026 (dia_inhabil vacío en pruebas)
        const [{ d }] = await sql`SELECT to_char(fn_sumar_dias_habiles('2026-11-27', 20), 'YYYY-MM-DD') AS d`;
        expect(d).toBe("2026-12-25");
    });

    it("solo el administrador ve la bandeja", async () => {
        const inv = await alumnoConPermiso();
        await expect(conContexto(inv.ctx, (tx) => solicitudesArco(tx, true))).rejects.toThrow(/PROHIBIDO/);
        await expect(conContexto(inv.ctx, (tx) => atenderSolicitud(tx, randomUUID(), "respuesta larga", false, null))).rejects.toThrow(/PROHIBIDO/);
    });

    it("atiende un acceso, responde al tutor y no deja atenderla dos veces", async () => {
        const inv = await alumnoConPermiso();
        const admin = await crearAdmin();
        expect(await solicitarArco(inv.token, await inv.codigo(), "acceso", "¿Qué datos guardan de Mateo?", null)).toBe("ok");
        const pendientes = (await conContexto(admin.ctx, (tx) => solicitudesArco(tx, true))).filter((s) => s.alumno.id === inv.alumnoId);
        expect(pendientes).toHaveLength(1);
        const s = pendientes[0];
        expect(s).toMatchObject({ tipo: "acceso", detalle: "¿Qué datos guardan de Mateo?", atendidaEn: null, alumno: { nombre: "Mateo Ruiz", anonimizado: false }, tutor: { correo: inv.tutorEmail } });
        expect(s.limite > s.creadaEn.slice(0, 10)).toBe(true);

        // Un acceso no permite borrar datos
        expect(await conContexto(admin.ctx, (tx) => atenderSolicitud(tx, s.id, "Respuesta de prueba", true, null))).toEqual({ resultado: "anonimizar_no_aplica" });

        const r = await conContexto(admin.ctx, (tx) => atenderSolicitud(tx, s.id, "Guardamos nombre, avance y emociones derivadas.", false, null));
        expect(r).toMatchObject({ resultado: "ok", tutorEmail: inv.tutorEmail, alumno: "Mateo", tipo: "acceso" });
        if (r.resultado !== "ok") throw new Error();
        bandejaMemoria.length = 0;
        expect(await avisarTutor(r, "Guardamos nombre, avance y emociones derivadas.", false)).toBe(true);
        expect(bandejaMemoria).toHaveLength(1);
        expect(bandejaMemoria[0]).toMatchObject({ para: inv.tutorEmail });
        expect(bandejaMemoria[0].texto).toContain("Guardamos nombre, avance y emociones derivadas.");

        expect(await conContexto(admin.ctx, (tx) => atenderSolicitud(tx, s.id, "Otra respuesta", false, null))).toEqual({ resultado: "ya_atendida" });
        const todas = (await conContexto(admin.ctx, (tx) => solicitudesArco(tx, false))).filter((x) => x.id === s.id);
        expect(todas[0]).toMatchObject({ respuesta: "Guardamos nombre, avance y emociones derivadas.", atendidaPor: "Ada Admin" });
        expect((await conContexto(admin.ctx, (tx) => solicitudesArco(tx, true))).some((x) => x.id === s.id)).toBe(false);
        const [a] = await sql`SELECT count(*)::int AS n FROM auditoria_acceso WHERE actor_id = ${admin.id} AND accion = 'arco' AND recurso_id = ${s.id}`;
        expect(a.n).toBe(1);
    });

    it("una revocación se atiende borrando los datos personales del alumno", async () => {
        const inv = await alumnoConPermiso();
        const admin = await crearAdmin();
        await sql`INSERT INTO nota_docente (alumno_id, docente_id, texto) SELECT ${inv.alumnoId}, g.docente_id, 'Nota privada' FROM grupo g WHERE g.id = ${inv.grupo.id}`;
        expect(await revocarConsentimiento(inv.token, await inv.codigo(), null)).toBe("ok");
        const [s] = (await conContexto(admin.ctx, (tx) => solicitudesArco(tx, true))).filter((x) => x.alumno.id === inv.alumnoId);
        expect(s.tipo).toBe("revocacion");

        const r = await conContexto(admin.ctx, (tx) => atenderSolicitud(tx, s.id, "Borramos los datos personales de Mateo.", true, null));
        // El correo del tutor se lee antes de anonimizar, para poder responderle
        expect(r).toMatchObject({ resultado: "ok", tutorEmail: inv.tutorEmail });
        const [alumno] = await sql`SELECT nombre, apellidos, pin_hash, activo FROM alumno WHERE id = ${inv.alumnoId}`;
        expect(alumno).toEqual({ nombre: "Alumno anonimizado", apellidos: "", pin_hash: null, activo: false });
        const [{ n }] = await sql`SELECT count(*)::int AS n FROM nota_docente WHERE alumno_id = ${inv.alumnoId}`;
        expect(n).toBe(0);
        const [c] = await sql`SELECT tutor_email::text AS correo FROM consentimiento_tutor WHERE alumno_id = ${inv.alumnoId}`;
        expect(c.correo).toBe("anonimizado@invalid");
        expect(await loginAlumno(inv.grupo.id, inv.alumnoId, ["sol", "sol", "sol", "sol"], null)).toMatchObject({ ok: false });
        const [vista] = (await conContexto(admin.ctx, (tx) => solicitudesArco(tx, false))).filter((x) => x.id === s.id);
        expect(vista.alumno.anonimizado).toBe(true);
    });
});
