// P-E2E-05 · Sin conexión (EXP-04.9, RI-05): el intento se encola, el alumno ve "Guardando…" y no un
// error, y al reconectar se sincroniza una sola vez; también si se cerró la página sin conexión.
import { expect, test } from "@playwright/test";
import { owner, preparar, respuestaCorrecta } from "./alumno-listo";

// Por alumno: con OpenAI activo la caché de historias reutiliza un mismo ejercicio entre alumnos
const intentosDe = async (ejercicioId: string, alumnoId: string) =>
    Number((await owner`SELECT count(*) AS n FROM intento_ejercicio WHERE ejercicio_id = ${ejercicioId} AND alumno_id = ${alumnoId}`)[0].n);

test("sin conexión: Guardando… y al reconectar se envía sin duplicar", async ({ page, context }) => {
    const { alumnoId } = await preparar(page, [{ nombre: "Sin red", tipo: "seleccion_multiple", num: 3 }]);
    await page.goto("/alumno");
    await page.getByRole("link", { name: /empezar/i }).click();
    const ej = await respuestaCorrecta(alumnoId, "Sin red");

    await context.setOffline(true);
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByText(/guardando/i)).toBeVisible();
    await expect(page.getByText(/no se guardó|no hay conexión/i)).toHaveCount(0);
    expect(await intentosDe(ej.id, alumnoId)).toBe(0);

    await context.setOffline(false);
    await expect(page.getByText(/muy bien.*\+10 puntos/i)).toBeVisible();
    await expect(page.getByText(/guardando/i)).toHaveCount(0);
    await expect(page.getByText("1/3")).toBeVisible();
    expect(await intentosDe(ej.id, alumnoId)).toBe(1);
});

test("sin conexión: el intento guardado se sincroniza al volver aunque se haya cerrado la página", async ({ page, context }) => {
    const { alumnoId } = await preparar(page, [{ nombre: "Recarga", tipo: "seleccion_multiple", num: 3 }]);
    await page.goto("/alumno");
    await page.getByRole("link", { name: /empezar/i }).click();
    const ej = await respuestaCorrecta(alumnoId, "Recarga");
    const url = page.url();

    await context.setOffline(true);
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByText(/guardando/i)).toBeVisible();
    await page.close(); // queda en IndexedDB del navegador

    await context.setOffline(false);
    const otra = await context.newPage();
    await otra.goto(url);
    // Al abrir, primero se reenvía lo pendiente: el ejercicio ya cuenta y se sirve el siguiente
    await expect(otra.getByText("1/3")).toBeVisible();
    expect(await intentosDe(ej.id, alumnoId)).toBe(1);
    const [s] = await owner`SELECT puntaje FROM asignacion_alumno WHERE alumno_id = ${alumnoId}`;
    expect(s.puntaje).toBe(10);
});
