// P-COMP · D7 Retroalimentaciones: registros por alumno y fecha, "¿Qué es…?" en ventanas modales,
// detalle con PANAS-C (una vez, con tooltips) y tabla del diagnóstico matemático por tema.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DetalleRetroalimentacion, ListaRetroalimentaciones } from "../../apps/web/src/modules/docente/componentes/Retroalimentaciones";

const DETALLE = {
    id: "r1", fecha: "2026-11-04", alumno: { id: "a1", nombre: "Ana López", grupo: "3A" },
    estadoInicial: "positivo", afectoPositivo: 4, afectoNegativo: 1.4, observaciones: [],
    descripcion: ["Resolvió el diagnóstico matemático en 6 min 30 s.", "Su mejor desempeño fue en Suma."],
    temas: [
        { temaId: "t1", tema: "Suma", ejercicios: 5, aciertos: 4, errores: 1, nivelDominio: 4, tiempoMs: 1 },
        { temaId: "t2", tema: "Resta", ejercicios: 4, aciertos: 1, errores: 3, nivelDominio: 2, tiempoMs: 1 },
    ],
};

function servidor(rutas: Record<string, unknown>) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        const hit = rutas[url.split("?")[0]];
        return hit !== undefined ? new Response(JSON.stringify(hit), { status: 200 }) : new Response(JSON.stringify({ error: { code: "NO_ENCONTRADO", message: "no" } }), { status: 404 });
    }));
}

describe("ListaRetroalimentaciones", () => {
    it("lista registros con nombre y fecha DD/MM/AAAA que llevan al detalle", async () => {
        servidor({
            "/api/v1/docente/grupos": { items: [{ id: "g1", nombre: "3A", grado: 3 }] },
            "/api/v1/docente/grupos/g1/retroalimentaciones": { items: [{ id: "r1", fecha: "2026-11-04", alumno: { id: "a1", nombre: "Ana López" }, estadoInicial: "positivo" }] },
        });
        render(<MemoryRouter><ListaRetroalimentaciones /></MemoryRouter>);
        expect(await screen.findByRole("heading", { name: "Retroalimentación de diagnósticos" })).toBeInTheDocument();
        const registro = await screen.findByRole("link", { name: /Ana López/ });
        expect(registro).toHaveTextContent("Fecha: 04/11/2026");
        expect(registro).toHaveAttribute("href", "/docente/retroalimentaciones/r1");
    });

    it("«¿Qué es…?» abre una ventana que se cierra con la X o con Esc y devuelve el foco", async () => {
        servidor({ "/api/v1/docente/grupos": { items: [{ id: "g1", nombre: "3A", grado: 3 }] }, "/api/v1/docente/grupos/g1/retroalimentaciones": { items: [{ id: "r1", fecha: "2026-11-04", alumno: { id: "a1", nombre: "Ana" }, estadoInicial: "neutral" }] } });
        const u = userEvent.setup();
        render(<MemoryRouter><ListaRetroalimentaciones /></MemoryRouter>);
        const boton = await screen.findByRole("button", { name: "¿Qué es el cuestionario socioemocional?" });
        await u.click(boton);
        const dialogo = screen.getByRole("dialog", { name: "¿Qué es el cuestionario socioemocional?" });
        expect(dialogo).toHaveTextContent(/PANAS-C/);
        expect(within(dialogo).getByRole("button", { name: "Cerrar" })).toHaveFocus();
        await u.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(boton).toHaveFocus();

        await u.click(screen.getByRole("button", { name: "¿Qué es el diagnóstico matemático?" }));
        expect(screen.getByRole("dialog", { name: "¿Qué es el diagnóstico matemático?" })).toHaveTextContent(/nivel de dominio/i);
        await u.click(screen.getByRole("button", { name: "Cerrar" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("sin diagnósticos muestra el aviso del diseño", async () => {
        servidor({ "/api/v1/docente/grupos": { items: [{ id: "g1", nombre: "3A", grado: 3 }] }, "/api/v1/docente/grupos/g1/retroalimentaciones": { items: [] } });
        render(<MemoryRouter><ListaRetroalimentaciones /></MemoryRouter>);
        expect(await screen.findByText("No se han realizado exámenes diagnósticos.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Retroalimentación" })).toBeInTheDocument();
    });
});

describe("DetalleRetroalimentacion", () => {
    it("nombre, fecha, PANAS-C una vez, descripción y tabla por tema", async () => {
        servidor({ "/api/v1/docente/retroalimentaciones/r1": DETALLE });
        render(<MemoryRouter><DetalleRetroalimentacion id="r1" /></MemoryRouter>);
        expect(await screen.findByText("Ana López")).toBeInTheDocument();
        expect(screen.getByText("04/11/2026")).toBeInTheDocument();
        const emocional = screen.getByRole("heading", { name: /Cuestionario socioemocional/ }).parentElement!;
        expect(emocional).toHaveTextContent("Positivo");
        expect(emocional).toHaveTextContent("4.0");
        expect(emocional).toHaveTextContent("1.4");
        expect(screen.getByText("Resolvió el diagnóstico matemático en 6 min 30 s.")).toBeInTheDocument();

        const fila = screen.getByRole("row", { name: /Resta/ });
        expect(within(fila).getAllByRole("cell").map((c) => c.textContent)).toEqual(["4", "1", "3", "2 de 5"]);
        // Lo emocional no se repite en la tabla
        expect(screen.queryByRole("columnheader", { name: /Aspectos|Índice/ })).toBeNull();
        expect(screen.getByRole("link", { name: "Ver ficha del alumno" })).toHaveAttribute("href", "/docente/alumnos/a1");
    });

    it("AP, AN y el PANAS-C explican su significado en un tooltip (mouse, teclado y toque)", async () => {
        servidor({ "/api/v1/docente/retroalimentaciones/r1": DETALLE });
        const u = userEvent.setup();
        render(<MemoryRouter><DetalleRetroalimentacion id="r1" /></MemoryRouter>);
        const ap = await screen.findByRole("button", { name: "AP: qué significa" });
        expect(ap).toHaveAccessibleDescription(/Afecto positivo/);
        await u.hover(ap);
        expect(screen.getByRole("tooltip")).toHaveTextContent(/emociones agradables/);
        await u.unhover(ap);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        const an = screen.getByRole("button", { name: "AN: qué significa" });
        act(() => an.focus());
        expect(screen.getByRole("tooltip")).toHaveTextContent(/desde 3\.0/);
        await u.keyboard("{Escape}");
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

        await u.click(screen.getByRole("button", { name: "Cuestionario socioemocional: qué mide" }));
        expect(screen.getByRole("tooltip")).toHaveTextContent(/autoinforme/);
        await u.click(document.body);
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("una retroalimentación ajena o inexistente muestra el error", async () => {
        servidor({});
        render(<MemoryRouter><DetalleRetroalimentacion id="otra" /></MemoryRouter>);
        expect(await screen.findByRole("alert")).toHaveTextContent("no");
    });
});
