// P-API (Supertest) · capa Express: guardas por rol y diagnósticos, formato de errores, cookie de
// sesión, cabeceras de seguridad y rutas principales sobre la BD de pruebas.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { crearApp } from "../../apps/api/src/app";
import { sql } from "../db/fixture";

const app = crearApp();

async function docente() {
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
    await sql`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true, acepta_camara = true WHERE alumno_id = ${alta.alumno.id}`;
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

describe("consentimiento del tutor (RC-08, RNF-10)", () => {
    it("el alta exige datos del tutor y devuelve el enlace; el alumno sin consentimiento recibe 403", async () => {
        const d = await docente();
        const grupo = (await d.agente.post("/api/v1/docente/grupos").send({ nombre: "Tutor", grado: 3, cicloEscolar: "2026-2027" })).body;
        expect((await d.agente.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`).send({ nombre: "Sin Tutor" })).status).toBe(400);
        const alta = await d.agente.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`).send({ nombre: "Rita", tutorNombre: "Tutor Rita", tutorEmail: "t@c.mx" });
        expect(alta.status).toBe(201);
        expect(alta.body.invitacion.url).toMatch(/\/consentimiento\/[\w-]{30,}$/);
        expect(alta.body.correoEnviado).toBe(true);
        const login = await request(app).post("/api/v1/auth/alumno/login").send({ grupoId: grupo.id, alumnoId: alta.body.alumno.id, pin: alta.body.pin });
        expect(login.status).toBe(403);
        expect(login.body.error.code).toBe("CONSENTIMIENTO_REQUERIDO");
        // Nuevo enlace para el tutor
        const otro = await d.agente.post(`/api/v1/docente/alumnos/${alta.body.alumno.id}/invitacion`);
        expect(otro.status).toBe(201);
        expect(otro.body.invitacion.url).not.toBe(alta.body.invitacion.url);
    });

    it("enlace inventado → 404 con Referrer-Policy no-referrer; ya no hay ruta ARCO", async () => {
        const r = await request(app).get("/api/v1/consentimiento/no-existe");
        expect(r.status).toBe(404);
        expect(r.headers["referrer-policy"]).toBe("no-referrer");
        expect((await request(app).post("/api/v1/consentimiento/no-existe/arco").send({ otp: "123456", tipo: "acceso" })).status).toBe(404);
    });
});

describe("EXP-05 por HTTP: fotogramas, sin alertas al docente", () => {
    it("ya no existen las alertas en vivo ni las guías de actuación", async () => {
        const { docente: d } = await alumnoConSesion();
        for (const ruta of ["/api/v1/docente/alertas", "/api/v1/docente/alertas/stream", `/api/v1/docente/guias/${randomUUID()}`]) {
            expect((await d.agente.get(ruta)).status).toBe(404);
        }
    });

    it("fotograma: solo imágenes ≤ 100 KB; con el consentimiento del tutor se procesa (cámara para todos, A-41)", async () => {
        const { agente, alta } = await alumnoConSesion();
        const [s] = await sql`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${alta.alumno.id}, fn_hoy_local()) ON CONFLICT (alumno_id, fecha) DO UPDATE SET fecha = EXCLUDED.fecha RETURNING id`;
        await sql`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en) VALUES (${s.id}, ${alta.alumno.id}, 4, 1, now()) ON CONFLICT DO NOTHING`;
        await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${s.id}, ${alta.alumno.id}, 'positivo') ON CONFLICT DO NOTHING`;
        const sinImagen = await agente.post("/api/v1/alumno/emociones/frame").set("Content-Type", "image/jpeg").send(Buffer.alloc(0));
        expect(sinImagen.status).toBe(400);
        const grande = await agente.post("/api/v1/alumno/emociones/frame").set("Content-Type", "image/jpeg").send(Buffer.alloc(101 * 1024, 1));
        expect(grande.status).toBe(413);
        const ok = await agente.post("/api/v1/alumno/emociones/frame").set("Content-Type", "image/jpeg").send(Buffer.from([0xff, 0xd8, 0xff, 1]));
        expect(ok.status).toBe(200);
        expect(ok.body.error).toBeUndefined();
    });

    it("un alumno que intenta entrar al área docente recibe 403", async () => {
        const { agente } = await alumnoConSesion();
        expect((await agente.get("/api/v1/docente/grupos")).status).toBe(403);
    });
});

describe("notas del docente por HTTP (CRUD)", () => {
    it("crear 201, listar, editar 200, borrar 204; validación 400 y 404 para ajenos o inexistentes", async () => {
        const d = await docente();
        const grupo = (await d.agente.post("/api/v1/docente/grupos").send({ nombre: "Notas", grado: 3, cicloEscolar: "2026-2027" })).body;
        const alumnoId = (await d.agente.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`).send({ nombre: "Leo", tutorNombre: "Tutor Leo", tutorEmail: "t@c.mx" })).body.alumno.id;
        const base = `/api/v1/docente/alumnos/${alumnoId}/notas`;

        const creada = await d.agente.post(base).send({ texto: "Primera", etiqueta: "academico" });
        expect(creada.status).toBe(201);
        expect(creada.body).toMatchObject({ texto: "Primera", etiqueta: "academico", propia: true });
        const url = `${base}/${creada.body.id}`;

        const editada = await d.agente.put(url).send({ texto: "  Corregida  ", etiqueta: null });
        expect(editada.status).toBe(200);
        expect(editada.body).toMatchObject({ id: creada.body.id, texto: "Corregida", etiqueta: null, fecha: creada.body.fecha });
        expect((await d.agente.put(url).send({ texto: "" })).status).toBe(400);
        expect((await d.agente.put(url).send({ texto: "x".repeat(501) })).status).toBe(400);
        expect((await d.agente.put(url).send({ texto: "ok", etiqueta: "inventada" })).status).toBe(400);
        expect((await d.agente.get(base)).body.items.map((n: { texto: string }) => n.texto)).toEqual(["Corregida"]);

        // Otro docente: 404 al editar y al borrar, y la nota no cambia
        const otro = await docente();
        expect((await otro.agente.put(url).send({ texto: "hack" })).status).toBe(404);
        expect((await otro.agente.delete(url)).status).toBe(404);
        expect((await d.agente.get(base)).body.items).toHaveLength(1);

        expect((await d.agente.delete(url)).status).toBe(204);
        expect((await d.agente.delete(url)).status).toBe(404);
        expect((await d.agente.put(`${base}/no-es-uuid`).send({ texto: "x" })).status).toBe(404);
        expect((await d.agente.get(base)).body.items).toEqual([]);
    });
});
describe("sin administrador ARCO (RC-07 fuera del MVP)", () => {
    it("no existen el acceso ni la bandeja del administrador", async () => {
        expect((await request(app).post("/api/v1/auth/admin/login").send({ email: "a@b.mx", password: "x" })).status).toBe(404);
        const d = await docente();
        expect((await d.agente.get("/api/v1/admin/arco")).status).toBe(404);
    });
});
