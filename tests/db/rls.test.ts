// P-DB-04 · RLS (RNF-04, RF-65) y funciones de autenticación (ADR-004, ADR-009, ADR-010)
import { describe, expect, it } from "vitest";
import { capturarError, comoApp, comoDueno, crearFixture, crearSesion, enTransaccion, IDS } from "./fixture";

describe("P-DB-04 · Row Level Security", () => {
    it("toda tabla con alumno_id tiene RLS habilitada", () =>
        enTransaccion(async (tx) => {
            const sinRls = await tx`SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND a.attname = 'alumno_id' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
            expect(sinRls.map((r) => r.relname)).toEqual([]);
        }));

    it("el rol de la app no puede saltarse RLS", () =>
        enTransaccion(async (tx) => {
            const [r] = await tx`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'numotion_app'`;
            expect(r).toEqual({ rolbypassrls: false, rolsuper: false });
        }));

    it("un docente solo ve alumnos y notas de sus grupos y no escribe sobre ajenos", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await tx`INSERT INTO nota_docente (docente_id, alumno_id, texto) VALUES (${IDS.docenteB}, ${IDS.alumnoB1}, 'nota de B')`;
            await comoApp(tx, "docente", IDS.docenteA);
            expect(await tx`SELECT id FROM alumno WHERE grupo_id = ${IDS.grupoB}`).toHaveLength(0);
            expect(await tx`SELECT id FROM alumno`).toHaveLength(2);
            expect(await tx`SELECT id FROM nota_docente WHERE alumno_id = ${IDS.alumnoB1}`).toHaveLength(0);
            const err = await capturarError(tx, (sp) =>
                sp`INSERT INTO nota_docente (docente_id, alumno_id, texto) VALUES (${IDS.docenteA}, ${IDS.alumnoB1}, 'x')`);
            expect(err?.code).toBe("42501");
            expect(await capturarError(tx, (sp) =>
                sp`INSERT INTO nota_docente (docente_id, alumno_id, texto) VALUES (${IDS.docenteA}, ${IDS.alumnoA1}, 'ok')`)).toBeNull();
        }));

    it("un alumno solo se ve a sí mismo y nunca lee sus eventos emocionales", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const s = await crearSesion(tx, IDS.alumnoA1);
            await comoApp(tx, "alumno", IDS.alumnoA1);
            expect(await tx`SELECT id FROM alumno`).toHaveLength(1);
            await tx`INSERT INTO evento_emocional (alumno_id, sesion_id, emocion, confianza, estado_derivado)
                     VALUES (${IDS.alumnoA1}, ${s}, 'HAPPY', 90, 'positivo')`;
            expect(await tx`SELECT id FROM evento_emocional`).toHaveLength(0);
            // ...pero el motor sí puede obtener sus estados recientes por la función dedicada
            expect(await tx`SELECT * FROM fn_estados_recientes(60)`).toHaveLength(1);
            // Sin acceso a notas ni resultados del docente
            expect(await tx`SELECT id FROM nota_docente`).toHaveLength(0);
            // No puede registrar eventos a nombre de otro alumno
            const err = await capturarError(tx, (sp) =>
                sp`INSERT INTO evento_emocional (alumno_id, sesion_id, emocion, confianza, estado_derivado)
                   VALUES (${IDS.alumnoA2}, ${s}, 'HAPPY', 90, 'positivo')`);
            expect(err?.code).toBe("42501");
        }));

    it("sin contexto la app no ve datos de alumnos, ni hashes, ni sesiones", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await comoApp(tx, null, null);
            expect(await tx`SELECT id FROM alumno`).toHaveLength(0);
            expect((await capturarError(tx, (sp) => sp`SELECT pin_hash FROM alumno`))?.code).toBe("42501");
            expect((await capturarError(tx, (sp) => sp`SELECT password_hash FROM docente`))?.code).toBe("42501");
            expect((await capturarError(tx, (sp) => sp`SELECT * FROM sesion_auth`))?.code).toBe("42501");
        }));

    it("el alumno ve solo actividades asignadas", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await comoApp(tx, "docente", IDS.docenteA);
            await tx`SELECT fn_registrar_asignacion(${IDS.docenteA}, 'Solo Ana', ${IDS.temaSuma}, 'arrastrar',
                     '2026-10-27', 5::smallint, NULL, ${[IDS.alumnoA1]}::uuid[])`;
            await comoApp(tx, "alumno", IDS.alumnoA2);
            expect(await tx`SELECT id FROM actividad`).toHaveLength(0);
            await comoApp(tx, "alumno", IDS.alumnoA1);
            expect(await tx`SELECT id FROM actividad`).toHaveLength(1);
        }));
});

describe("Autenticación por funciones SECURITY DEFINER", () => {
    it("alumno: avatares del grupo, bloqueo tras 5 fallos y sesión del día al entrar", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await comoApp(tx, null, null);
            const avatares = await tx`SELECT * FROM fn_avatares_grupo('aaa111')`;
            expect(avatares).toEqual([
                { grupo_id: IDS.grupoA, alumno_id: IDS.alumnoA1, avatar: "gato", nombre_corto: "Ana" },
                { grupo_id: IDS.grupoA, alumno_id: IDS.alumnoA2, avatar: "perro", nombre_corto: "Beto" },
            ]);
            const [datos] = await tx`SELECT * FROM fn_auth_alumno(${IDS.grupoA}, ${IDS.alumnoA1})`;
            expect(datos).toEqual({ id: IDS.alumnoA1, nombre: "Ana", avatar: "gato", pin_hash: "pin", bloqueado_hasta: null, consentimiento: true });
            // Un alumno de otro grupo no entra con el código de este
            expect(await tx`SELECT * FROM fn_auth_alumno(${IDS.grupoA}, ${IDS.alumnoB1})`).toHaveLength(0);

            for (let i = 0; i < 5; i++) await tx`SELECT fn_auth_alumno_resultado(${IDS.alumnoA1}, false, NULL)`;
            const [bloq] = await tx`SELECT bloqueado_hasta FROM fn_auth_alumno(${IDS.grupoA}, ${IDS.alumnoA1})`;
            expect(bloq.bloqueado_hasta).not.toBeNull();

            const [{ s }] = await tx`SELECT fn_auth_alumno_resultado(${IDS.alumnoA1}, true, NULL) AS s`;
            expect(s).not.toBeNull();
        }));

    it("la sesión resuelve alumno y docente vigentes; una vencida no vale, ni la del alumno sin consentimiento (RC-08)", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await comoApp(tx, null, null);
            await tx`SELECT fn_crear_sesion_auth('h1', 'alumno', ${IDS.alumnoA1}, now() + interval '4 hours')`;
            await tx`SELECT fn_crear_sesion_auth('h2', 'docente', ${IDS.docenteA}, now() + interval '8 hours')`;
            await tx`SELECT fn_crear_sesion_auth('h3', 'docente', ${IDS.docenteA}, now() - interval '1 minute')`;
            expect(await tx`SELECT * FROM fn_sesion_auth('h1')`).toEqual([{ rol: "alumno", usuario_id: IDS.alumnoA1, nombre: "Ana", grupo_id: IDS.grupoA }]);
            expect((await tx`SELECT * FROM fn_sesion_auth('h2')`)[0]).toMatchObject({ rol: "docente", nombre: "Docente A" });
            expect(await tx`SELECT * FROM fn_sesion_auth('h3')`).toHaveLength(0);

            // Revocar el consentimiento o publicar un aviso nuevo invalida la sesión del alumno
            await comoDueno(tx);
            await tx`UPDATE consentimiento_tutor SET revocado_en = now() WHERE alumno_id = ${IDS.alumnoA1}`;
            await comoApp(tx, null, null);
            expect(await tx`SELECT * FROM fn_sesion_auth('h1')`).toHaveLength(0);
            expect((await tx`SELECT consentimiento FROM fn_auth_alumno(${IDS.grupoA}, ${IDS.alumnoA1})`)[0].consentimiento).toBe(false);

            await comoDueno(tx);
            await tx`UPDATE consentimiento_tutor SET revocado_en = NULL WHERE alumno_id = ${IDS.alumnoA1}`;
            await tx`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v2', now(), '/privacidad')`;
            await comoApp(tx, null, null);
            expect(await tx`SELECT * FROM fn_sesion_auth('h1')`).toHaveLength(0);

            // RC-07 sigue fuera del MVP (migración 0015): sin ARCO, administrador ni auditoría
            await comoDueno(tx);
            const [{ n }] = await tx`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'
                AND tablename IN ('auditoria_acceso', 'administrador', 'solicitud_arco', 'alerta', 'guia_actuacion')`;
            expect(n).toBe(0);
        }));

    it("docente: registro único por correo (insensible a mayúsculas)", () =>
        enTransaccion(async (tx) => {
            await comoApp(tx, null, null);
            await tx`SELECT fn_registrar_docente('Maestra Uno', 'maestra@escuela.mx', 'h')`;
            const err = await capturarError(tx, (sp) => sp`SELECT fn_registrar_docente('Otra', 'MAESTRA@escuela.mx', 'h')`);
            expect(err?.message).toBe("EMAIL_DUPLICADO");
            const [d] = await tx`SELECT nombre FROM fn_auth_docente('Maestra@Escuela.mx')`;
            expect(d.nombre).toBe("Maestra Uno");
        }));
});
