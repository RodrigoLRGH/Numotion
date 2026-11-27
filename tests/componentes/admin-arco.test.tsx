// P-COMP · Bandeja ARCO del administrador (RC-07): plazo, respuesta al tutor y borrado de datos
// solo en cancelación, oposición y revocación.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SolicitudesArco } from "../../apps/web/src/modules/admin/paginas";

const base = {
    detalle: "", atendidaEn: null, respuesta: null, atendidaPor: null, grupo: "3A", docente: "Laura Demo",
    tutor: { nombre: "Rosa", correo: "rosa@correo.mx" }, creadaEn: "2026-11-20T16:00:00Z",
};
const ITEMS = [
    { ...base, id: "s1", tipo: "acceso", detalle: "¿Qué datos tienen?", limite: "2020-01-10", alumno: { id: "a1", nombre: "Ana López", anonimizado: false } },
    { ...base, id: "s2", tipo: "revocacion", limite: "2099-12-18", alumno: { id: "a2", nombre: "Beto Ruiz", anonimizado: false } },
];

function servidor() {
    const llamadas: { url: string; metodo: string; cuerpo?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        llamadas.push({ url, metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (metodo === "GET") return new Response(JSON.stringify({ items: ITEMS }), { status: 200 });
        return new Response(JSON.stringify({ atendida: true, anonimizado: true, correoEnviado: false }), { status: 200 });
    }));
    return llamadas;
}

describe("SolicitudesArco", () => {
    it("muestra tipo, alumno, tutor y plazo; el borrado solo se ofrece donde aplica", async () => {
        servidor();
        render(<MemoryRouter><SolicitudesArco /></MemoryRouter>);
        const acceso = await screen.findByRole("article", { name: /Acceso · Ana López/ });
        expect(within(acceso).getByText(/Plazo vencido/)).toBeInTheDocument();
        expect(within(acceso).getByText("¿Qué datos tienen?")).toBeInTheDocument();
        expect(within(acceso).getByText(/rosa@correo\.mx/)).toBeInTheDocument();
        expect(within(acceso).queryByRole("checkbox")).toBeNull();

        const revocacion = screen.getByRole("article", { name: /Revocación del permiso · Beto Ruiz/ });
        expect(within(revocacion).getByText(/Fecha límite/)).toBeInTheDocument();
        expect(within(revocacion).getByRole("checkbox", { name: /Borrar los datos personales/ })).not.toBeChecked();
    });

    it("atiende con borrado de datos y avisa si el correo no salió", async () => {
        const llamadas = servidor();
        const u = userEvent.setup();
        render(<MemoryRouter><SolicitudesArco /></MemoryRouter>);
        const revocacion = await screen.findByRole("article", { name: /Revocación del permiso · Beto Ruiz/ });
        await u.type(within(revocacion).getByLabelText("Respuesta para el tutor"), "Borramos los datos de Beto.");
        await u.click(within(revocacion).getByRole("checkbox", { name: /Borrar los datos personales/ }));
        await u.click(within(revocacion).getByRole("button", { name: "Atender y borrar datos" }));
        expect(llamadas.find((l) => l.metodo === "POST")).toEqual({
            url: "/api/v1/admin/arco/s2/atender", metodo: "POST", cuerpo: { respuesta: "Borramos los datos de Beto.", anonimizar: true },
        });
        expect(await screen.findByText(/no se pudo enviar el correo.*rosa@correo\.mx/)).toBeInTheDocument();
    });
});
