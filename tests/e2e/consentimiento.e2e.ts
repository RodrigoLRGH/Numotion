// P-E2E-01 (paso de consentimiento) y P-SEC-04 en navegador: el docente da de alta, el tutor recibe
// el correo, verifica con el código, decide plataforma/cámara, y después retira el permiso.
// Lee los correos que escribe CORREO_PROVEEDOR=archivo en CORREO_DIR (tmp/correos).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const DIR = process.env.CORREO_DIR ?? "tmp/correos";
const owner = postgres(process.env.DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion", { max: 1, onnotice: () => {} });
test.afterAll(() => owner.end());

async function ultimoCorreo(para: string): Promise<{ asunto: string; texto: string }> {
    for (let i = 0; i < 20; i++) {
        const archivos = (await readdir(DIR).catch(() => [])).sort().reverse();
        for (const a of archivos) {
            const c = JSON.parse(await readFile(path.join(DIR, a), "utf8"));
            if (c.para === para) return c;
        }
        await new Promise((ok) => setTimeout(ok, 250));
    }
    throw new Error(`sin correo para ${para}`);
}

async function codigoNuevo(page: Page, para: string): Promise<string> {
    const antes = (await readdir(DIR).catch(() => [])).length;
    await page.getByRole("button", { name: /enviar código/i }).click();
    await expect(page.getByText(/enviamos un código de 6 dígitos/i)).toBeVisible();
    await expect.poll(async () => (await readdir(DIR)).length).toBeGreaterThan(antes);
    return (await ultimoCorreo(para)).texto.match(/\b(\d{6})\b/)![1];
}

async function sinViolacionesSerias(page: Page) {
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
}

test("tutor: recibe la invitación, acepta sin cámara y luego retira el permiso", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const sufijo = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const tutor = `tutor.${sufijo}@ejemplo.mx`;
    const req = page.request;
    await req.post("/api/v1/auth/docente/registro", { data: { nombre: "Docente Consent", email: `d.${sufijo}@escuela.mx`, password: "contraseña-e2e", aceptaAviso: true } });
    const grupo = await (await req.post("/api/v1/docente/grupos", { data: { nombre: "5C", grado: 5, cicloEscolar: "2026-2027" } })).json();
    const alta = await (await req.post(`/api/v1/docente/grupos/${grupo.id}/alumnos`, {
        data: { nombre: "Tomás", apellidos: "Ejemplo", tutorNombre: "Ana Ejemplo", tutorEmail: tutor },
    })).json();
    expect(alta.correoEnviado).toBe(true);

    // El alumno aún no puede entrar
    const entrar = () => req.post("/api/v1/auth/alumno/login", { data: { grupoId: grupo.id, alumnoId: alta.alumno.id, pin: alta.pin } });
    expect((await entrar()).status()).toBe(403);

    // 1. Invitación por correo con el enlace
    const invitacion = await ultimoCorreo(tutor);
    expect(invitacion.texto).toContain(alta.invitacion.url);
    expect(invitacion.texto).not.toContain("Ejemplo"); // sin apellidos

    // 2. El tutor abre el enlace (sin sesión)
    const tutorCtx = await browser.newContext();
    const t = await tutorCtx.newPage();
    await t.goto(new URL(alta.invitacion.url).pathname);
    await expect(t.getByRole("heading", { name: "Permiso para Tomás" })).toBeVisible();
    await expect(t.getByText(/esperando tu autorización/i)).toBeVisible();
    await expect(t.getByText(/nunca se guardan/i)).toBeVisible();
    await sinViolacionesSerias(t);

    const otp = await codigoNuevo(t, tutor);
    await t.getByLabel("Parentesco").selectOption("madre");
    await t.getByLabel(/autorizo que tomás use la plataforma/i).check();
    await expect(t.getByLabel(/autorizo la cámara/i)).not.toBeChecked();
    await t.getByLabel("Código de 6 dígitos").fill(otp);
    await t.screenshot({ path: "test-results/capturas/09-tutor.png", fullPage: true });
    await t.getByRole("button", { name: /guardar mi decisión/i }).click();
    await expect(t.getByText(/ya puede usar la plataforma sin cámara/i)).toBeVisible();

    // 3. Ahora el alumno sí entra, sin cámara
    const login = await entrar();
    expect(login.status()).toBe(200);
    expect((await login.json()).camaraPermitida).toBe(false);
    expect((await req.get("/api/v1/alumno/diagnostico/panas")).status()).toBe(200);

    // 4. El tutor retira el permiso → la sesión del alumno se cierra en el siguiente request
    await owner`UPDATE consentimiento_tutor SET otp_enviado_en = NULL WHERE tutor_email = ${tutor}`; // evita esperar el minuto
    await t.getByRole("button", { name: /retirar el permiso/i }).click();
    const otp2 = await codigoNuevo(t, tutor);
    await t.getByLabel("Código de 6 dígitos").fill(otp2);
    await t.getByRole("button", { name: /sí, retirar el permiso/i }).click();
    await expect(t.getByText(/retiraste el permiso/i)).toBeVisible();
    expect((await req.get("/api/v1/alumno/diagnostico/panas")).status()).toBe(401);

    // 5. El docente ve el estado y puede generar un enlace nuevo
    await req.post("/api/v1/auth/docente/login", { data: { email: `d.${sufijo}@escuela.mx`, password: "contraseña-e2e" } });
    await page.goto("/docente/grupos");
    await expect(page.getByText("Revocado")).toBeVisible();
    await page.getByRole("button", { name: /nuevo enlace para el tutor de tomás/i }).click();
    await expect(page.getByRole("heading", { name: /nuevo enlace para el tutor de tomás/i })).toBeVisible();
    await expect(page.getByText("Esperando al tutor")).toBeVisible();
    await sinViolacionesSerias(page);
    await tutorCtx.close();
});

test("un enlace inventado no revela nada y la página no filtra el token por Referer", async ({ page }) => {
    const api = await page.request.get("/api/v1/consentimiento/no-existe");
    expect(api.status()).toBe(404);
    expect(api.headers()["referrer-policy"]).toBe("no-referrer");
    await page.goto("/consentimiento/no-existe");
    await expect(page.getByRole("heading", { name: /este enlace no es válido/i })).toBeVisible();
    await expect(page.locator("meta[name=referrer]")).toHaveAttribute("content", "no-referrer");
});
