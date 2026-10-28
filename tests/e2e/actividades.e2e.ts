// P-E2E-02 (parte de asignación) · El docente asigna con el asistente, sigue el avance y consulta el historial.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const owner = postgres(process.env.DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion", { max: 1, onnotice: () => {} });
test.afterAll(() => owner.end());

async function sinViolacionesSerias(page: Page) {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join()}`)).toEqual([]);
}

async function hidratada(page: Page) {
    await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

test("docente: asigna con el asistente, ve el avance y el historial", async ({ page }) => {
    test.setTimeout(90_000);
    const sufijo = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const req = page.request;
    await req.post("/api/v1/auth/docente/registro", { data: { nombre: "Docente Asigna", email: `a.${sufijo}@escuela.mx`, password: "contraseña-e2e", aceptaAviso: true } });
    const grupo = await (await req.post("/api/v1/docente/grupos", { data: { nombre: `A${sufijo.slice(-3)}`, grado: 3, cicloEscolar: "2026-2027" } })).json();
    const alumnos = [];
    for (const nombre of ["Lucía", "Mario"]) {
        alumnos.push(await (await req.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`, { data: { nombre, tutorNombre: "Tutor", tutorEmail: "t@ejemplo.mx" } })).json());
    }

    // API: destino doble → 422
    const temas = (await (await req.get("/api/v1/catalogo/temas")).json()).items;
    const suma = temas.find((t: { clave: string }) => t.clave === "suma");
    const doble = await req.post("/api/v1/docente/actividades", {
        data: { nombre: "x", temaId: suma.id, tipoInteraccion: "seleccion_multiple", fechaAsignacion: "2026-10-27", numEjercicios: 3,
                destino: { tipo: "grupo", grupoId: grupo.id, alumnoIds: [alumnos[0].alumno.id] } },
    });
    expect(doble.status()).toBe(422);
    expect((await doble.json()).error.code).toBe("ASIGNACION_DESTINO_INVALIDO");

    // Asistente
    await page.goto("/docente/actividades/nueva");
    await hidratada(page);
    await page.getByLabel("Nombre").fill("Sumas E2E");
    await page.getByLabel("Tema").selectOption({ label: "Suma" });
    await page.getByLabel("Número de ejercicios").fill("3");
    await sinViolacionesSerias(page);
    await page.getByRole("button", { name: /siguiente/i }).click();
    await page.getByLabel("Grupo", { exact: true }).selectOption(grupo.id);
    await expect(page.getByText(/todo el grupo \(2 alumnos\)/i)).toBeVisible();
    await page.getByRole("button", { name: /revisar niveles/i }).click();
    await expect(page.getByRole("cell", { name: /lucía/i })).toBeVisible();
    await expect(page.getByText("sin diagnóstico reciente: nivel por defecto")).toHaveCount(2);
    await sinViolacionesSerias(page);
    await page.screenshot({ path: "test-results/capturas/10-asistente.png", fullPage: true });
    await page.getByRole("button", { name: /asignar/i }).click();
    await expect(page.getByText(/se asignó a 2 alumnos/i)).toBeVisible();

    // Lucía completa la actividad (simula al motor de EXP-04 con intentos directos)
    const [asig] = await owner`SELECT s.id FROM asignacion_alumno s JOIN actividad a ON a.id = s.actividad_id
                                WHERE a.nombre = 'Sumas E2E' AND s.alumno_id = ${alumnos[0].alumno.id}`;
    for (const correcta of [true, true, false]) {
        const [e] = await owner`INSERT INTO ejercicio (tema_id, tipo_interaccion, nivel, enunciado, respuesta, pasos_solucion, origen)
            VALUES (${suma.id}, 'seleccion_multiple', 2, '{}', '{}', '[{"orden":1,"texto":"a"},{"orden":2,"texto":"b"}]', 'generador') RETURNING id`;
        await owner`INSERT INTO intento_ejercicio (asignacion_id, alumno_id, ejercicio_id, nivel, respuesta, correcta, numero_intento, tiempo_ms, cliente_id)
                    VALUES (${asig.id}, ${alumnos[0].alumno.id}, ${e.id}, 2, '{}', ${correcta}, ${correcta ? 1 : 4}, 40000, gen_random_uuid())`;
    }

    // Seguimiento
    await page.getByRole("link", { name: /ver actividades asignadas/i }).click();
    await hidratada(page);
    const tarjeta = page.getByRole("article").filter({ hasText: "Sumas E2E" });
    await expect(tarjeta.getByText(/1\s*completadas · 0\s*en curso · 1\s*pendientes/)).toBeVisible();
    await tarjeta.getByText("Ver alumnos").click();
    await expect(tarjeta.getByRole("row", { name: /lucía.*completada.*3\/3.*6\.7/i })).toBeVisible();
    await sinViolacionesSerias(page);
    await page.screenshot({ path: "test-results/capturas/11-actividades.png", fullPage: true });

    // Historial con filtro por alumno persistido en la URL
    await page.getByRole("link", { name: "Historial", exact: true }).click();
    await hidratada(page);
    await page.getByLabel("Grupo").selectOption(grupo.id);
    await page.getByLabel("Alumno").selectOption({ label: "Lucía" });
    await expect(page).toHaveURL(new RegExp(`alumnoId=${alumnos[0].alumno.id}`));
    await expect(page.getByRole("row", { name: /lucía.*sumas e2e.*suma.*6\.7/i })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Alumno")).toHaveValue(alumnos[0].alumno.id);
    await expect(page.getByRole("row", { name: /sumas e2e/i })).toHaveCount(1);
    await sinViolacionesSerias(page);
    await page.screenshot({ path: "test-results/capturas/12-historial.png", fullPage: true });
});
