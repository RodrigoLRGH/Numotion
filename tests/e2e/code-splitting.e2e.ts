// T-03-04-21 · P-PERF-01 auxiliar: el alumno nunca descarga código del docente, la pantalla de
// actividad se precarga desde "Mis actividades" y "Siguiente" usa el ejercicio ya pedido.
import { expect, test } from "@playwright/test";
import { preparar, respuestaCorrecta } from "./alumno-listo";

test("alumno: sin código del docente, actividad precargada y siguiente ejercicio pedido de antemano", async ({ page }) => {
    test.setTimeout(90_000);
    const peticiones: string[] = [];
    page.on("request", (r) => peticiones.push(new URL(r.url()).pathname));
    const { alumnoId } = await preparar(page, [{ nombre: "Sumas precarga", tipo: "seleccion_multiple", num: 3 }]);

    await page.goto("/alumno");
    await expect(page.getByRole("heading", { name: "Mis actividades" })).toBeVisible();
    // La pantalla de actividad llega antes de pulsar "Empezar"
    await expect.poll(() => peticiones.some((p) => /ResolverActividad/.test(p))).toBe(true);

    await page.getByRole("link", { name: /empezar/i }).click();
    const ej = await respuestaCorrecta(alumnoId, "Sumas precarga");
    const siguientes = () => peticiones.filter((p) => p.endsWith("/siguiente")).length;
    await page.getByRole("group", { name: "Opciones" }).getByRole("button", { name: ej.valor, exact: true }).click();
    await expect(page.getByText(/muy bien.*\+10 puntos/i)).toBeVisible();
    // Precarga: el siguiente se pide al cerrar el ejercicio, no al pulsar el botón
    await expect.poll(siguientes).toBe(1);
    await page.getByRole("button", { name: /siguiente/i }).click();
    await expect(page.getByText("1/3")).toBeVisible();
    expect(siguientes()).toBe(1);

    expect(peticiones.filter((p) => /modules\/docente|docente-/.test(p))).toEqual([]);
});
