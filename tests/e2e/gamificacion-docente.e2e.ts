// P-E2E-01 (panel, práctica libre y perfil del alumno, EXP-06), P-E2E-04 (cámara: indicador y
// fotogramas sin guardar imágenes, EXP-05.1), P-E2E-02/03 (panel docente con resumen previo,
// ficha y reporte, EXP-07) y P-A11Y-01 (axe sin violaciones serias). La cámara simulada y su
// permiso vienen de playwright.config.ts.
import { expect, test } from "@playwright/test";
import { captura, owner, preparar, respuestaCorrecta, sinViolacionesSerias } from "./alumno-listo";

test("alumno: panel con racha y mensaje, juego de práctica libre completo y perfil con insignias", async ({ page }) => {
    test.setTimeout(90_000);
    const { alumnoId } = await preparar(page, [{ nombre: "Sumas panel", tipo: "seleccion_multiple", num: 3 }]);
    await page.goto("/alumno");
    await expect(page.getByRole("heading", { name: /Hola, Sofía/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Mensaje del día" })).toContainText("Sofía");
    await expect(page.getByRole("list", { name: "Días de esta semana" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Mis actividades" })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "alumno-panel");

    await page.getByRole("link", { name: /Jugar libre/ }).click();
    await page.getByRole("region", { name: "Suma" }).getByRole("button", { name: /Selección múltiple/ }).click();
    await expect(page.getByText("1/5")).toBeVisible();
    await sinViolacionesSerias(page);
    const [p] = await owner`SELECT ejercicios FROM practica_libre WHERE alumno_id = ${alumnoId} ORDER BY creado_en DESC LIMIT 1`;
    for (let i = 0; i < 5; i++) {
        const [{ valor }] = await owner`SELECT respuesta->>'valor' AS valor FROM ejercicio WHERE id = ${p.ejercicios[i]}`;
        await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: valor, exact: true }).click();
        await page.getByRole("button", { name: i === 4 ? /Terminar/ : /Siguiente/ }).click();
    }
    await expect(page.getByRole("heading", { name: "¡Terminaste el juego!" })).toBeVisible();
    await expect(page.getByText("+15 puntos")).toBeVisible(); // RF-03: 5 aciertos al 1.er intento × 3
    await captura(page, "alumno-practica-fin");
    const [{ habil }] = await owner`SELECT fn_es_dia_habil(fn_hoy_local()) AS habil`;
    const [r] = await owner`SELECT racha_actual FROM fn_racha_vigente(${alumnoId}::uuid)`;
    expect(r?.racha_actual ?? 0).toBe(habil ? 1 : 0);

    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await page.getByRole("link", { name: /Perfil/ }).click();
    await expect(page.getByRole("heading", { name: "Sofía" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Mis insignias/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/frustraci|afecto/i);
    await sinViolacionesSerias(page);
    await captura(page, "alumno-perfil");
});

test("alumno con cámara: indicador visible y solo se guarda la emoción derivada", async ({ page }) => {
    test.setTimeout(60_000);
    const { alumnoId } = await preparar(page, [{ nombre: "Con cámara", tipo: "seleccion_multiple", num: 3 }]);
    await page.goto("/alumno");
    await page.getByRole("link", { name: /empezar/i }).click();
    await respuestaCorrecta(alumnoId, "Con cámara");
    await expect(page.getByRole("status").filter({ hasText: "Cámara activa" })).toBeVisible();
    await expect.poll(async () => Number((await owner`SELECT count(*) AS n FROM evento_emocional WHERE alumno_id = ${alumnoId}`)[0].n), { timeout: 30_000 }).toBeGreaterThan(0);
    const [ev] = await owner`SELECT emocion, estado_derivado FROM evento_emocional WHERE alumno_id = ${alumnoId} LIMIT 1`;
    expect(ev.estado_derivado).toMatch(/positivo|neutral|frustracion|sin_dato/);
    await sinViolacionesSerias(page);
});

test("docente: resumen previo, ficha del alumno (sin alertas) y reporte", async ({ page }) => {
    test.setTimeout(60_000);
    const { docente } = await preparar(page, [{ nombre: "Restas 2", tipo: "seleccion_multiple", num: 3, tema: "resta" }]);
    await page.context().clearCookies();
    expect((await page.request.post("/api/v1/auth/docente/login", { data: docente })).status()).toBe(200);

    await page.goto("/docente");
    await expect(page.getByRole("heading", { name: "Gráfica global" })).toBeVisible();
    await expect(page.getByText(/1 de 1 con diagnóstico/)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Sofía" })).toContainText("Positivo");
    // El panel ya no muestra alertas
    await expect(page.getByText(/Alertas activas/)).toHaveCount(0);
    await sinViolacionesSerias(page);
    await captura(page, "docente-panel");

    // Retroalimentaciones: registro del diagnóstico de hoy, su detalle y de ahí a la ficha
    await page.getByRole("link", { name: "Retroalimentaciones" }).click();
    await page.getByRole("link", { name: /Sofía/ }).first().click();
    await expect(page.getByRole("heading", { name: "Descripción:" })).toBeVisible();
    await sinViolacionesSerias(page);
    await page.getByRole("link", { name: "Ver ficha del alumno" }).click();
    await expect(page.getByRole("heading", { name: /Sofía/ })).toBeVisible();
    // Sin alertas al docente (RF-16 fuera del MVP): la ficha no muestra guía ni "Marcar como atendida"
    await expect(page.getByRole("button", { name: "Ver guía" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Marcar como atendida/ })).toHaveCount(0);
    await sinViolacionesSerias(page);
    for (const pestana of ["Perfil estadístico", "Cruce emoción-desempeño", "Resultados", "Notas"]) {
        await page.getByRole("tab", { name: pestana }).click();
        await expect(page.getByRole("tab", { name: pestana })).toHaveAttribute("aria-selected", "true");
    }
    await sinViolacionesSerias(page);

    await page.getByRole("link", { name: "Reportes" }).click();
    await expect(page.getByRole("heading", { name: "Reporte" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Exportar CSV/ })).toHaveCount(0);
    await sinViolacionesSerias(page);
    await captura(page, "docente-reportes");
});
