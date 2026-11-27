// Utilidades de los E2E del alumno: alumno listo para trabajar hoy y lectura de la respuesta vigente.
// Las pruebas leen la BD como owner solo para conocer la respuesta correcta; el navegador nunca la recibe.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

export const owner = postgres(process.env.DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion", { max: 1, idle_timeout: 5, onnotice: () => {} });
// idle_timeout: la conexión se cierra sola entre archivos de prueba (el worker se reutiliza)

export async function sinViolacionesSerias(page: Page) {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join()}`)).toEqual([]);
}

export const captura = (page: Page, nombre: string) =>
    page.screenshot({ path: `test-results/capturas/${test.info().project.name}-${nombre}.png`, fullPage: true });

/** Docente con un alumno listo para trabajar hoy (consentimiento y diagnósticos del día hechos). */
export async function preparar(page: Page, actividades: { nombre: string; tipo: string; num: number; tema?: string }[], opciones: { camara?: boolean } = {}) {
    const sufijo = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const req = page.request;
    const docente = { email: `m.${sufijo}@escuela.mx`, password: "contraseña-e2e" };
    await req.post("/api/v1/auth/docente/registro", { data: { nombre: "Docente Motor", ...docente, aceptaAviso: true } });
    const grupo = await (await req.post("/api/v1/docente/grupos", { data: { nombre: "M", grado: 3, cicloEscolar: "2026-2027" } })).json();
    const alta = await (await req.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`, { data: { nombre: "Sofía", tutorNombre: "Tutor Sofía", tutorEmail: "t@ejemplo.mx" } })).json();
    const alumnoId: string = alta.alumno.id;
    await owner`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true, acepta_camara = ${opciones.camara ?? false} WHERE alumno_id = ${alumnoId}`;
    const temas = (await (await req.get("/api/v1/catalogo/temas")).json()).items;
    const [{ hoy }] = await owner`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
    for (const a of actividades) {
        const r = await req.post("/api/v1/docente/actividades", {
            data: { nombre: a.nombre, temaId: temas.find((t: { clave: string; id: string }) => t.clave === (a.tema ?? "suma")).id, tipoInteraccion: a.tipo, fechaAsignacion: hoy, numEjercicios: a.num, destino: { tipo: "grupo", grupoId: grupo.id } },
        });
        expect(r.status()).toBe(201);
    }
    // Diagnósticos del día ya respondidos (los cubre flujo-diario.e2e.ts)
    const [s] = await owner`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${alumnoId}, fn_hoy_local()) RETURNING id`;
    await owner`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en) VALUES (${s.id}, ${alumnoId}, 4, 1.5, now())`;
    await owner`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${s.id}, ${alumnoId}, 'positivo')`;
    await req.post("/api/v1/auth/logout");
    await page.context().clearCookies();
    expect((await req.post("/api/v1/auth/alumno/login", { data: { grupoId: grupo.id, alumnoId, pin: alta.pin } })).status()).toBe(200);
    return { alumnoId, grupoId: grupo.id as string, docente };
}

/** Respuesta del ejercicio vigente; espera a que la página haya pedido uno nuevo (distinto de `anterior`). */
export async function respuestaCorrecta(alumnoId: string, actividad: string, anterior?: string): Promise<{ id: string; valor: string }> {
    let fila: { id: string; valor: string } | undefined;
    await expect
        .poll(async () => {
            [fila] = await owner<{ id: string; valor: string }[]>`
                SELECT e.id, e.respuesta->>'valor' AS valor FROM asignacion_alumno s
                  JOIN actividad a ON a.id = s.actividad_id JOIN ejercicio e ON e.id = s.ejercicio_actual_id
                 WHERE s.alumno_id = ${alumnoId} AND a.nombre = ${actividad}`;
            return fila && fila.id !== anterior ? fila.id : null;
        })
        .not.toBeNull();
    return fila!;
}

export async function opcionIncorrecta(page: Page, correcta: string) {
    const opciones = page.getByRole("group", { name: "Opciones" }).getByRole("button", { disabled: false });
    for (const o of await opciones.all()) {
        // El botón antepone la letra de la opción («a)», aria-hidden): se compara solo el valor
        const t = (await o.textContent())?.trim().replace(/^[a-z]\)\s*/i, "");
        if (t && t !== correcta) return o;
    }
    throw new Error("sin opción incorrecta disponible");
}
