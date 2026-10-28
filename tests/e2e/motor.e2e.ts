// P-E2E-01 (parte de actividad) · El alumno resuelve una actividad: acierto, 3 fallos con guía,
// acierto tras la guía y recompensa; y una de arrastrar resuelta solo con toques.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const owner = postgres(process.env.DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion", { max: 1, onnotice: () => {} });
test.afterAll(() => owner.end());

async function sinViolacionesSerias(page: Page) {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join()}`)).toEqual([]);
}

const captura = (page: Page, nombre: string) =>
    page.screenshot({ path: `test-results/capturas/${test.info().project.name}-${nombre}.png`, fullPage: true });

/** Docente con un alumno listo para trabajar hoy (consentimiento y diagnósticos del día hechos). */
async function preparar(page: Page, actividades: { nombre: string; tipo: string; num: number }[]) {
    const sufijo = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const req = page.request;
    await req.post("/api/v1/auth/docente/registro", { data: { nombre: "Docente Motor", email: `m.${sufijo}@escuela.mx`, password: "contraseña-e2e", aceptaAviso: true } });
    const grupo = await (await req.post("/api/v1/docente/grupos", { data: { nombre: "M", grado: 3, cicloEscolar: "2026-2027" } })).json();
    const alta = await (await req.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`, { data: { nombre: "Sofía", tutorNombre: "Tutor Sofía", tutorEmail: "t@ejemplo.mx" } })).json();
    const alumnoId: string = alta.alumno.id;
    await owner`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true WHERE alumno_id = ${alumnoId}`;
    const temas = (await (await req.get("/api/v1/catalogo/temas")).json()).items;
    const suma = temas.find((t: { clave: string }) => t.clave === "suma");
    const [{ hoy }] = await owner`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
    for (const a of actividades) {
        const r = await req.post("/api/v1/docente/actividades", {
            data: { nombre: a.nombre, temaId: suma.id, tipoInteraccion: a.tipo, fechaAsignacion: hoy, numEjercicios: a.num, destino: { tipo: "grupo", grupoId: grupo.id } },
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
    return { alumnoId };
}

/** Respuesta del ejercicio vigente; espera a que la página haya pedido uno nuevo (distinto de `anterior`). */
async function respuestaCorrecta(alumnoId: string, actividad: string, anterior?: string): Promise<{ id: string; valor: string }> {
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

async function opcionIncorrecta(page: Page, correcta: string) {
    const opciones = page.getByRole("group", { name: "Opciones" }).getByRole("button", { disabled: false });
    for (const o of await opciones.all()) {
        const t = (await o.textContent())?.trim();
        if (t && t !== correcta) return o;
    }
    throw new Error("sin opción incorrecta disponible");
}

test("alumno: resuelve una actividad con acierto, guía tras 3 fallos y recompensa", async ({ page }) => {
    test.setTimeout(90_000);
    const { alumnoId } = await preparar(page, [{ nombre: "Sumas del día", tipo: "seleccion_multiple", num: 3 }]);

    await page.goto("/alumno");
    await expect(page.getByRole("heading", { name: "Mis actividades" })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "13-mis-actividades");
    await page.getByRole("link", { name: /empezar/i }).click();

    // Ejercicio 1: acierto al primer intento
    let ej = await respuestaCorrecta(alumnoId, "Sumas del día");
    await expect(page.getByText("0/3")).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "14-ejercicio");
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByText(/muy bien.*\+10 puntos/i)).toBeVisible();
    await expect(page.getByText("1/3")).toBeVisible();
    await page.getByRole("button", { name: /siguiente/i }).click();

    // Ejercicio 2: 3 fallos → guía paso a paso. Las opciones intentadas quedan tachadas (A-29), así que
    // en el 4.º intento solo queda la correcta y vale 3 puntos (tras guía)
    ej = await respuestaCorrecta(alumnoId, "Sumas del día", ej.id);
    for (let i = 1; i <= 3; i++) {
        await (await opcionIncorrecta(page, ej.valor)).click();
        // El «¡Casi!» optimista llega antes que el servidor: se espera la confirmación (opción tachada)
        await expect(page.getByRole("button", { name: /ya intentado/ })).toHaveCount(i);
    }
    await expect(page.getByRole("heading", { name: /paso a paso/i })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "15-guia");
    await page.getByRole("button", { name: /ya entendí/i }).click();
    await expect(page.getByRole("button", { name: /ya intentado/ })).toHaveCount(3);
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByText(/muy bien.*\+3 puntos/i)).toBeVisible();
    await page.getByRole("button", { name: /siguiente/i }).click();

    // Ejercicio 3: acierto → recompensa (10 + 3 + 10 puntos, 3 de 3 correctos)
    ej = await respuestaCorrecta(alumnoId, "Sumas del día", ej.id);
    await expect(page.getByText("2/3")).toBeVisible();
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByRole("heading", { name: "¡Terminaste!" })).toBeVisible();
    await expect(page.getByText("+23 puntos")).toBeVisible();
    await expect(page.getByRole("img", { name: "3 de 3 estrellas" })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "16-recompensa");

    const [s] = await owner`SELECT s.estado, s.resultado_final, s.puntaje FROM asignacion_alumno s WHERE s.alumno_id = ${alumnoId}`;
    expect(s).toEqual({ estado: "completada", resultado_final: "10.00", puntaje: 23 });
    await page.getByRole("link", { name: /volver al inicio/i }).click();
    await expect(page.getByText(/no tienes actividades pendientes/i)).toBeVisible();
});

test("alumno: arrastrar y soltar se puede resolver solo con toques", async ({ page }) => {
    const { alumnoId } = await preparar(page, [{ nombre: "Arrastra", tipo: "arrastrar", num: 3 }]);
    await page.goto("/alumno");
    await page.getByRole("link", { name: /empezar/i }).click();
    const { valor } = await respuestaCorrecta(alumnoId, "Arrastra");
    await page.getByRole("group", { name: /fichas/i }).getByRole("button", { name: valor, exact: true }).click();
    await expect(page.getByRole("status", { name: `Recuadro: ${valor}` })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "17-arrastrar");
    await page.getByRole("button", { name: /comprobar/i }).click();
    await expect(page.getByText(/muy bien.*\+10 puntos/i)).toBeVisible();
});
