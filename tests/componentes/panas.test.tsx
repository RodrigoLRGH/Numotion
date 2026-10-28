// P-COMP-05 · PANAS-C: un ítem por pantalla, retomar, guardado incremental (EXP-02.1, EXP-02.5)
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const irA = vi.fn();
vi.mock("../../apps/web/src/shared/cliente/api", async (original) => ({
    ...(await original<typeof import("../../apps/web/src/shared/cliente/api")>()),
    irA: (ruta: string) => irA(ruta),
}));

import PanasC from "../../apps/web/src/modules/alumno/componentes/PanasC";

const items = Array.from({ length: 10 }, (_, i) => ({ id: `i${i + 1}`, orden: i + 1, texto: `Pregunta ${i + 1}` }));
const escala = ["Nada", "Un poco", "Más o menos", "Bastante", "Muchísimo"].map((etiqueta, i) => ({ valor: i + 1, etiqueta }));

const ok = (cuerpo: unknown, status = 200) =>
    Promise.resolve(new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status }));

describe("PanasC", () => {
    beforeEach(() => irA.mockReset());

    it("retoma en el primer ítem sin responder y guarda cada respuesta", async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => ok({ items, escala, respondidos: ["i1", "i2"], completado: false }))
            .mockImplementation(() => ok(null, 204));
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<PanasC />);

        expect(await screen.findByRole("heading", { name: "Pregunta 3" })).toBeInTheDocument();
        expect(screen.getByText("3 de 10")).toBeInTheDocument();

        await u.click(screen.getByRole("button", { name: "Bastante" }));
        expect(fetch).toHaveBeenLastCalledWith("/api/v1/alumno/diagnostico/panas/respuestas/i3", expect.objectContaining({ method: "PUT", body: '{"valor":4}' }));
        expect(await screen.findByRole("heading", { name: "Pregunta 4" })).toBeInTheDocument();

        // Atrás muestra lo elegido
        await u.click(screen.getByRole("button", { name: /atrás/i }));
        expect(screen.getByRole("button", { name: "Bastante" })).toHaveAttribute("aria-pressed", "true");
    });

    it("al responder el último ítem finaliza y pasa al diagnóstico matemático", async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => ok({ items, escala, respondidos: items.slice(0, 9).map((i) => i.id), completado: false }))
            .mockImplementationOnce(() => ok(null, 204))
            .mockImplementationOnce(() => ok({ completado: true }));
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<PanasC />);
        await u.click(await screen.findByRole("button", { name: "Nada" }));
        await vi.waitFor(() => expect(irA).toHaveBeenCalledWith("/alumno/diagnostico/matematico"));
        expect(fetch.mock.calls[2][0]).toBe("/api/v1/alumno/diagnostico/panas/finalizar");
    });

    it("si ya lo completó hoy, no lo vuelve a mostrar", async () => {
        vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => ok({ items, escala, respondidos: [], completado: true })));
        render(<PanasC />);
        await vi.waitFor(() => expect(irA).toHaveBeenCalledWith("/alumno/diagnostico/matematico"));
    });

    it("nunca muestra puntajes de afecto", async () => {
        vi.stubGlobal("fetch", vi.fn().mockImplementationOnce(() => ok({ items, escala, respondidos: [], completado: false })));
        const { container } = render(<PanasC />);
        await screen.findByRole("heading", { name: "Pregunta 1" });
        expect(container.textContent).not.toMatch(/afecto|positivo|negativo/i);
    });
});
