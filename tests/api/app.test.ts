// P-API (Supertest) · capa Express: guardas por rol y diagnósticos, formato de errores, cookie de
// sesión, cabeceras de seguridad y rutas principales sobre la BD de pruebas.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { crearApp } from "../../apps/api/src/app";
import { sql } from "../db/fixture";

const app = crearApp();

async function docente() {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad') ON CONFLICT DO NOTHING`;
    const agente = request.agent(app);
    const email = `api-${randomUUID()}@escuela.mx`;
    const r = await agente.post("/api/v1/auth/docente/registro").send({ nombre: "Docente API", email, password: "contraseña-segura", aceptaAviso: true });
    expect(r.status).toBe(201);
    return { agente, email, cookie: r.headers["set-cookie"] as unknown as string[] };
}

async function alumnoConSesion() {
    const d = await docente();
    const grupo = (await d.agente.post("/api/v1/docente/grupos").send({ nombre: "API", grado: 3, cicloEscolar: "2026-2027" })).body;
    const alta = (await d.agente.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`).send({ nombre: "Lía", tutorNombre: "Tutor Lía", tutorEmail: "t@c.mx" })).body;
    await sql`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true WHERE alumno_id = ${alta.alumno.id}`;
    const agente = request.agent(app);
    const r = await agente.post("/api/v1/auth/alumno/login").send({ grupoId: grupo.id, alumnoId: alta.alumno.id, pin: alta.pin });
    expect(r.status).toBe(200);
    return { agente, docente: d, grupo, alta };
}

describe("errores y cabeceras", () => {
    it("sin sesión: 401 con el formato del contrato", async () => {
        const r = await request(app).get("/api/v1/docente/grupos");
        expect(r.status).toBe(401);
        expect(r.body).toEqual({ error: { code: "NO_AUTENTICADO", message: "Inicia sesión para continuar" } });
    });

    it("cabeceras de seguridad, sin caché y sin x-powered-by", async () => {
        const r = await request(app).get("/api/v1/auth/sesion");
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ usuario: null });
        expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
        expect(r.headers["permissions-policy"]).toContain("camera=(self)");
        expect(r.headers["cache-control"]).toBe("no-store");
        expect(r.headers["x-powered-by"]).toBeUndefined();
    });

    it("JSON mal formado → 400; ruta desconocida → 404; id mal formado → 404", async () => {
        const d = await docente();
        const malo = await d.agente.post("/api/v1/docente/grupos").set("Content-Type", "application/json").send("{malo");
        expect(malo.status).toBe(400);
        expect(malo.body.error.code).toBe("VALIDACION");
        expect((await d.agente.get("/api/v1/no-existe")).status).toBe(404);
        const r = await d.agente.get("/api/v1/docente/grupos/no-es-uuid/alumnos");
        expect(r.status).toBe(404);
        expect(r.body.error.code).toBe("NO_ENCONTRADO");
    });

    it("validación de entrada: 400 con el campo en el mensaje", async () => {
        const d = await docente();
        const r = await d.agente.post("/api/v1/docente/grupos").send({ nombre: "", grado: 9, cicloEscolar: "x" });
        expect(r.status).toBe(400);
        expect(r.body.error.message).toMatch(/«nombre»/);
    });
});

describe("sesión del docente", () => {
    it("la cookie es HttpOnly y SameSite=Strict; /auth/sesion devuelve al docente; logout la invalida", async () => {
        const d = await docente();
        expect(d.cookie[0]).toMatch(/nm_sesion=.+; Path=\/; Expires=.+; HttpOnly; SameSite=Strict/);
        expect((await d.agente.get("/api/v1/auth/sesion")).body).toMatchObject({ usuario: { rol: "docente", nombre: "Docente API" } });
        expect((await d.agente.post("/api/v1/auth/logout")).status).toBe(204);
        // Aunque alguien conserve la cookie vieja, la sesión ya no existe en BD
        const viejo = await request(app).get("/api/v1/docente/grupos").set("Cookie", d.cookie[0].split(";")[0]);
        expect(viejo.status).toBe(401);
    });

    it("login con contraseña mala → 401 CREDENCIALES_INVALIDAS; correo repetido → 409", async () => {
        const d = await docente();
        const r = await request(app).post("/api/v1/auth/docente/login").send({ email: d.email, password: "mala" });
        expect(r.status).toBe(401);
        expect(r.body.error.code).toBe("CREDENCIALES_INVALIDAS");
        const rep = await request(app).post("/api/v1/auth/docente/registro").send({ nombre: "Otro", email: d.email, password: "contraseña-segura", aceptaAviso: true });
        expect(rep.status).toBe(409);
        expect(rep.body.error.code).toBe("CONFLICTO");
    });

    it("un docente no entra al módulo alumno (403) y el destino doble de una actividad es 422", async () => {
        const d = await docente();
        expect((await d.agente.get("/api/v1/alumno/actividades")).body.error.code).toBe("PROHIBIDO");
        const grupo = (await d.agente.post("/api/v1/docente/grupos").send({ nombre: "X", grado: 3, cicloEscolar: "2026-2027" })).body;
        const [tema] = await sql`SELECT id FROM tema WHERE clave = 'suma'`;
        const r = await d.agente.post("/api/v1/docente/actividades").send({
            nombre: "x", temaId: tema.id, tipoInteraccion: "seleccion_multiple", fechaAsignacion: "2026-10-27", numEjercicios: 3,
            destino: { tipo: "grupo", grupoId: grupo.id, alumnoIds: [randomUUID()] },
        });
        expect(r.status).toBe(422);
        expect(r.body.error.code).toBe("ASIGNACION_DESTINO_INVALIDO");
    });
});

describe("alumno: compuerta de diagnósticos (RF-63)", () => {
    it("sin diagnósticos del día: actividades 403 DIAGNOSTICOS_PENDIENTES, diagnósticos permitidos, y la sesión lo indica", async () => {
        const a = await alumnoConSesion();
        expect((await a.agente.get("/api/v1/auth/sesion")).body).toMatchObject({
            usuario: { rol: "alumno", nombre: "Lía", grupoId: a.grupo.id },
            consentimientoVigente: true,
            sesion: { panasCompleto: false, diagnosticoCompleto: false },
        });
        const r = await a.agente.get("/api/v1/alumno/actividades");
        expect(r.status).toBe(403);
        expect(r.body.error.code).toBe("DIAGNOSTICOS_PENDIENTES");
        expect((await a.agente.get("/api/v1/alumno/diagnostico/panas")).status).toBe(200);
        expect((await a.agente.get("/api/v1/docente/grupos")).body.error.code).toBe("PROHIBIDO");
    });

    it("guardado incremental de PANAS: 204, y 404 para un ítem inexistente", async () => {
        const a = await alumnoConSesion();
        const panas = (await a.agente.get("/api/v1/alumno/diagnostico/panas")).body;
        expect((await a.agente.put(`/api/v1/alumno/diagnostico/panas/respuestas/${panas.items[0].id}`).send({ valor: 4 })).status).toBe(204);
        expect((await a.agente.put(`/api/v1/alumno/diagnostico/panas/respuestas/${randomUUID()}`).send({ valor: 4 })).status).toBe(404);
        expect((await a.agente.put(`/api/v1/alumno/diagnostico/panas/respuestas/${panas.items[0].id}`).send({ valor: 9 })).status).toBe(400);
    });

    it("al revocar el consentimiento la siguiente petición es 401", async () => {
        const a = await alumnoConSesion();
        await sql`UPDATE consentimiento_tutor SET revocado_en = now() WHERE alumno_id = ${a.alta.alumno.id}`;
        expect((await a.agente.get("/api/v1/alumno/diagnostico/panas")).status).toBe(401);
    });
});

describe("consentimiento público", () => {
    it("enlace inventado → 404 con Referrer-Policy no-referrer", async () => {
        const r = await request(app).get("/api/v1/consentimiento/no-existe");
        expect(r.status).toBe(404);
        expect(r.headers["referrer-policy"]).toBe("no-referrer");
    });
});
