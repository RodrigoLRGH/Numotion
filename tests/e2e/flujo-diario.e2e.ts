// P-E2E-01 (alumno: entrar → PANAS-C → diagnóstico → panel), P-E2E-02 (docente: alta de alumno)
// y P-A11Y-01 (axe-core sin violaciones serias). Crea sus propios datos en la BD de desarrollo.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { ICONOS_PIN } from "../../src/modules/shared/dominio/acceso";

const owner = postgres(process.env.DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion", { max: 1, onnotice: () => {} });
test.afterAll(() => owner.end());

const nombreIcono = (id: string) => ICONOS_PIN.find((i) => i.id === id)!.nombre;

async function sinViolacionesSerias(page: Page) {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serias = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function captura(page: Page, nombre: string) {
    await page.screenshot({ path: `test-results/capturas/${test.info().project.name}-${nombre}.png`, fullPage: true });
}

/** Docente nuevo con un grupo y un alumno con consentimiento aceptado. */
async function prepararGrupo(page: Page) {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@escuela.mx`;
    const req = page.request;
    expect((await req.post("/api/v1/auth/docente/registro", { data: { nombre: "Docente E2E", email, password: "contraseña-e2e", aceptaAviso: true } })).status()).toBe(201);
    const grupo = await (await req.post("/api/v1/docente/grupos", { data: { nombre: "E2E", grado: 2, cicloEscolar: "2026-2027" } })).json();
    const alta = await (await req.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`, {
        data: { nombre: "Valeria", apellidos: "Prueba", tutorNombre: "Tutor E2E", tutorEmail: "tutor@ejemplo.mx" },
    })).json();
    await owner`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true WHERE alumno_id = ${alta.alumno.id}`;
    await req.post("/api/v1/auth/logout");
    await page.context().clearCookies();
    return { email, grupo, alta };
}

test("alumno: entra con código, avatar y PIN; responde los diagnósticos del día y llega a su panel", async ({ page }) => {
    test.setTimeout(120_000); // ~15 preguntas con su pausa de retroalimentación
    const { grupo, alta } = await prepararGrupo(page);

    await page.goto("/entrar");
    await sinViolacionesSerias(page);
    await captura(page, "01-codigo");
    await page.getByLabel("Código del grupo").fill(grupo.codigoAcceso.toLowerCase());
    await page.getByRole("button", { name: /seguir/i }).click();

    await expect(page.getByRole("heading", { name: "¿Quién eres?" })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "02-avatar");
    await page.getByRole("button", { name: /valeria/i }).click();

    await expect(page.getByRole("heading", { name: /toca tu clave secreta/i })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "03-pin");
    for (const icono of alta.pin as string[]) await page.getByRole("button", { name: nombreIcono(icono), exact: true }).click();

    // La compuerta lleva al PANAS-C
    await expect(page).toHaveURL(/\/alumno\/diagnostico\/emocional$/);
    await expect(page.getByText("1 de 10")).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "04-panas");
    for (let i = 0; i < 4; i++) {
        await page.getByRole("button", { name: "Bastante" }).click();
        await expect(page.getByText(`${i + 2} de 10`)).toBeVisible();
    }

    // EXP-02.5: al recargar retoma donde se quedó
    await page.reload();
    await expect(page.getByText("5 de 10")).toBeVisible();
    for (let i = 5; i <= 10; i++) {
        await page.getByRole("button", { name: "Un poco" }).click();
        if (i < 10) await expect(page.getByText(`${i + 1} de 10`)).toBeVisible();
    }

    await expect(page).toHaveURL(/\/alumno\/diagnostico\/matematico$/);
    await expect(page.getByText(/Tema 1 de/)).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "05-matematico");
    for (let n = 0; n < 40 && !page.url().endsWith("/alumno"); n++) {
        const opcion = page.locator("main button:not([disabled])").filter({ hasNotText: "🔊" }).first();
        await opcion.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(1100);
    }

    await expect(page).toHaveURL(/\/alumno$/);
    await expect(page.getByRole("heading", { name: /hola, valeria/i })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "06-panel");

    // Ya no vuelve a pedir los diagnósticos hoy
    await page.goto("/alumno/diagnostico/emocional");
    await expect(page).toHaveURL(/\/alumno\/diagnostico\/matematico$|\/alumno$/);
});

test("docente: entra, ve su grupo con código y da de alta un alumno", async ({ page }) => {
    const { email } = await prepararGrupo(page);

    await page.goto("/docente");
    await expect(page).toHaveURL(/\/login\?siguiente=%2Fdocente$/);
    await sinViolacionesSerias(page);
    await captura(page, "07-login");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill("contraseña-e2e");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/docente$/);

    await page.getByRole("link", { name: "Grupos", exact: true }).click();
    await expect(page.getByRole("heading", { name: /grupo e2e/i })).toBeVisible();
    await expect(page.getByText("Consentimiento vigente")).toBeVisible();

    await page.getByLabel("Nombre(s)").fill("Mateo");
    await page.getByLabel("Apellidos").fill("Ejemplo");
    await page.getByLabel("Nombre del tutor").fill("Laura Ejemplo");
    await page.getByLabel("Correo del tutor").fill("laura@ejemplo.mx");
    await page.getByRole("button", { name: "Agregar alumno" }).click();
    await expect(page.getByRole("heading", { name: /mateo ya está en el grupo/i })).toBeVisible();
    await expect(page.getByText("Esperando al tutor")).toBeVisible();
    await expect(page.getByLabel("Enlace de consentimiento")).toHaveValue(/\/consentimiento\//);
    await sinViolacionesSerias(page);
    await captura(page, "08-grupos");

    // Salir invalida la sesión
    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/docente/grupos");
    await expect(page).toHaveURL(/\/login/);
});
