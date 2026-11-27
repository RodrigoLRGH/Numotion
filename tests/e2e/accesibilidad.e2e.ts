// CP54 · P-A11Y-01 (RI-01): las pantallas principales del docente, del alumno y las públicas no tienen
// ninguna violación WCAG 2.1 nivel A o AA según axe-core (de cualquier impacto, no solo las graves).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { owner, preparar } from "./alumno-listo";

async function sinViolaciones(page: Page, ruta: string) {
    await page.goto(ruta);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const violaciones = r.violations.map((v) => `${ruta}: ${v.id} (${v.impact}) × ${v.nodes.length} → ${v.nodes[0]?.target.join(" ")}`);
    expect.soft(violaciones, `violaciones WCAG 2.1 AA en ${ruta}`).toEqual([]);
    return r.passes.length;
}

test("WCAG 2.1 AA: pantallas públicas", async ({ page }) => {
    for (const ruta of ["/", "/privacidad", "/docente/entrar", "/docente/registro", "/alumno/entrar", "/alumno/sin-permiso", "/consentimiento/no-existe"]) {
        await sinViolaciones(page, ruta);
    }
});

test("WCAG 2.1 AA: pantallas del alumno y del docente", async ({ page }) => {
    test.setTimeout(120_000);
    const { alumnoId, docente } = await preparar(page, [{ nombre: "Accesible", tipo: "seleccion_multiple", num: 3 }]);
    const [{ id: asignacionId }] = await owner`SELECT id FROM asignacion_alumno WHERE alumno_id = ${alumnoId}`;

    for (const ruta of ["/alumno", "/alumno/actividades", `/alumno/actividades/${asignacionId}`, "/alumno/perfil", "/alumno/practica"]) {
        await sinViolaciones(page, ruta);
    }

    await page.request.post("/api/v1/auth/logout");
    await page.context().clearCookies();
    expect((await page.request.post("/api/v1/auth/docente/login", { data: docente })).status()).toBe(200);
    for (const ruta of [
        "/docente", "/docente/grupos", "/docente/actividades", "/docente/actividades/nueva", "/docente/historial",
        "/docente/reportes", "/docente/retroalimentaciones", `/docente/alumnos/${alumnoId}`,
    ]) {
        await sinViolaciones(page, ruta);
    }
});
