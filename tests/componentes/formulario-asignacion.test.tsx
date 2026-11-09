// P-COMP-04 · FormularioAsignacion: 3 pasos, destino excluyente y previsualización del nivel inicial
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FormularioAsignacion from "../../apps/web/src/modules/docente/componentes/FormularioAsignacion";

const TEMAS = [
    { id: "t-suma", clave: "suma", nombre: "Suma", gradoMin: 1, gradoMax: 6, tiposInteraccion: ["seleccion_multiple", "arrastrar", "completar_operacion", "suma_figuras"] },
    { id: "t-div", clave: "division", nombre: "División", gradoMin: 3, gradoMax: 6, tiposInteraccion: ["seleccion_multiple"] },
];
const ALUMNOS = [
    { id: "a1", nombre: "Ana", apellidos: "López", avatar: "gato", activo: true },
    { id: "a2", nombre: "Beto", apellidos: "", avatar: "perro", activo: true },
    { id: "a3", nombre: "Baja", apellidos: "", avatar: "oso", activo: false },
];

function servidor() {
    const llamadas: { url: string; metodo: string; cuerpo?: unknown }[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        llamadas.push({ url, metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        const r = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });
        if (url === "/api/v1/catalogo/temas") return r({ items: TEMAS });
        if (url === "/api/v1/docente/grupos") return r({ items: [{ id: "g1", nombre: "2A", grado: 2 }] });
        if (url === "/api/v1/docente/grupos/g1/alumnos") return r({ items: ALUMNOS });
        if (url.startsWith("/api/v1/docente/actividades/previsualizar-niveles")) {
            return r({ items: [{ alumnoId: "a2", nombre: "Beto", avatar: "perro", nivelInicial: 1, sinDiagnostico: false, estadoInicial: "frustracion" }] });
        }
        if (url === "/api/v1/docente/actividades" && metodo === "POST") return r({ actividadId: "x", asignaciones: [{}] }, 201);
        return r({ error: { code: "NO_ENCONTRADO", message: "no" } }, 404);
    });
    vi.stubGlobal("fetch", fetch);
    return llamadas;
}

describe("FormularioAsignacion", () => {
    it("filtra temas por grado y tipos por tema; no avanza sin datos completos", async () => {
        servidor();
        const u = userEvent.setup();
        render(<FormularioAsignacion />);
        const tema = await screen.findByLabelText("Tema");
        await vi.waitFor(() => expect(screen.getAllByRole("option", { name: "Suma" })).toHaveLength(1));
        // Grupo de 2.º: División (3.º a 6.º) no aparece
        expect(screen.queryByRole("option", { name: "División" })).toBeNull();
        expect(screen.getByRole("button", { name: /siguiente/i })).toBeDisabled();

        await u.type(screen.getByLabelText("Nombre"), "Sumas 1");
        await u.selectOptions(tema, "t-suma");
        expect([...(screen.getByLabelText("Tipo de ejercicio") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
            "Selección múltiple", "Arrastrar y soltar", "Completar la operación", "Suma con figuras",
        ]);
        expect(screen.getByRole("button", { name: /siguiente/i })).toBeEnabled();
    });

    it("con alumnos específicos envía solo alumnoIds y muestra el nivel inicial con su motivo", async () => {
        const llamadas = servidor();
        const u = userEvent.setup();
        render(<FormularioAsignacion />);
        await u.type(await screen.findByLabelText("Nombre"), "Sumas 1");
        await vi.waitFor(() => expect(screen.getAllByRole("option", { name: "Suma" })).toHaveLength(1));
        await u.selectOptions(screen.getByLabelText("Tema"), "t-suma");
        await u.click(screen.getByRole("button", { name: /siguiente/i }));

        // Paso 2: los inactivos no se ofrecen
        expect(await screen.findByText(/todo el grupo \(2 alumnos\)/i)).toBeInTheDocument();
        await u.click(screen.getByLabelText(/alumnos específicos/i));
        expect(screen.getByRole("button", { name: /revisar niveles/i })).toBeDisabled();
        expect(screen.queryByLabelText(/baja/i)).toBeNull();
        await u.click(screen.getByLabelText(/beto/i));
        await u.click(screen.getByRole("button", { name: /revisar niveles/i }));

        // Paso 3: previsualización
        expect(await screen.findByText("bajó 1 por frustración al inicio del día")).toBeInTheDocument();
        const previa = llamadas.find((l) => l.url.includes("previsualizar"))!;
        expect(previa.url).toContain("alumnoIds=a2");
        expect(previa.url).not.toContain("grupoId");

        await u.click(screen.getByRole("button", { name: /asignar/i }));
        expect(await screen.findByText(/se asignó a 1 alumno/i)).toBeInTheDocument();
        const post = llamadas.find((l) => l.metodo === "POST")!;
        expect(post.cuerpo).toMatchObject({ nombre: "Sumas 1", temaId: "t-suma", tipoInteraccion: "seleccion_multiple", numEjercicios: 10 });
        expect((post.cuerpo as { destino: unknown }).destino).toEqual({ tipo: "alumnos", alumnoIds: ["a2"] });
    });

    it("con todo el grupo envía solo grupoId", async () => {
        const llamadas = servidor();
        const u = userEvent.setup();
        render(<FormularioAsignacion />);
        await u.type(await screen.findByLabelText("Nombre"), "Repaso");
        await vi.waitFor(() => expect(screen.getAllByRole("option", { name: "Suma" })).toHaveLength(1));
        await u.selectOptions(screen.getByLabelText("Tema"), "t-suma");
        await u.click(screen.getByRole("button", { name: /siguiente/i }));
        await u.click(await screen.findByRole("button", { name: /revisar niveles/i }));
        await u.click(await screen.findByRole("button", { name: /asignar/i }));
        await screen.findByText(/se asignó/i);
        expect((llamadas.find((l) => l.metodo === "POST")!.cuerpo as { destino: unknown }).destino).toEqual({ tipo: "grupo", grupoId: "g1" });
    });
});
