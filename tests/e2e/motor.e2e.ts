// P-E2E-01 (parte de actividad) · El alumno resuelve una actividad: acierto, 3 fallos que cierran el
// ejercicio con la guía y la respuesta (RF-11, RF-45), acierto y recompensa; arrastrar resuelta solo con toques, y colorear la figura (RF-44).
import { expect, test } from "@playwright/test";
import { captura, opcionIncorrecta, owner, preparar, respuestaCorrecta, sinViolacionesSerias } from "./alumno-listo";

test("alumno: resuelve una actividad con acierto, guía y respuesta tras 3 fallos, y recompensa", async ({ page }) => {
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

    // Ejercicio 2: máximo 3 intentos (RF-11). Las opciones intentadas quedan tachadas (A-29); el 3.er
    // fallo cierra el ejercicio con la guía paso a paso y la respuesta correcta (RF-45)
    ej = await respuestaCorrecta(alumnoId, "Sumas del día", ej.id);
    for (let i = 1; i <= 2; i++) {
        await (await opcionIncorrecta(page, ej.valor)).click();
        // El «¡Casi!» optimista llega antes que el servidor: se espera la confirmación (opción tachada)
        await expect(page.getByRole("button", { name: /ya intentado/ })).toHaveCount(i);
    }
    await (await opcionIncorrecta(page, ej.valor)).click();
    await expect(page.getByRole("heading", { name: /así se resuelve/i })).toBeVisible();
    await expect(page.getByText(/La respuesta es/)).toContainText(ej.valor);
    await sinViolacionesSerias(page);
    await captura(page, "15-guia");
    await page.getByRole("button", { name: /seguir/i }).click();

    // Ejercicio 3: acierto → recompensa (10 + 0 + 10 puntos, 2 de 3 correctos)
    ej = await respuestaCorrecta(alumnoId, "Sumas del día", ej.id);
    await expect(page.getByText("2/3")).toBeVisible();
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByRole("heading", { name: "¡Terminaste!" })).toBeVisible();
    await expect(page.getByText("+20 puntos")).toBeVisible();
    await expect(page.getByRole("img", { name: "1 de 3 estrellas" })).toBeVisible();
    await sinViolacionesSerias(page);
    await captura(page, "16-recompensa");

    const [s] = await owner`SELECT s.estado, s.resultado_final, s.puntaje FROM asignacion_alumno s WHERE s.alumno_id = ${alumnoId}`;
    expect(s).toEqual({ estado: "completada", resultado_final: "6.67", puntaje: 20 });
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

test("alumno: colorea la figura pedida con la paleta (nombre y patrón) y toques", async ({ page }) => {
    const { alumnoId } = await preparar(page, [{ nombre: "Colorea", tema: "geometria", tipo: "colorear_figura", num: 3 }]);
    await page.goto("/alumno");
    await page.getByRole("link", { name: /empezar/i }).click();
    const { id } = await respuestaCorrecta(alumnoId, "Colorea");
    const [{ lienzo }] = await owner`SELECT enunciado->'lienzo' AS lienzo FROM ejercicio WHERE id = ${id}`;
    const { tipo, color } = lienzo.instruccion as { tipo: string; color: string };

    await page.getByRole("group", { name: "Paleta de colores" }).getByRole("button", { name: color === "cafe" ? "café" : color, exact: true }).click();
    const figuras = page.getByRole("group", { name: "Figuras" }).getByRole("button");
    for (const [i, f] of (lienzo.figuras as { tipo: string }[]).entries()) if (f.tipo === tipo) await figuras.nth(i).click();
    await sinViolacionesSerias(page);
    await captura(page, "18-colorear");
    await page.getByRole("button", { name: /comprobar/i }).click();
    await expect(page.getByText(/muy bien.*\+10 puntos/i)).toBeVisible();
});
