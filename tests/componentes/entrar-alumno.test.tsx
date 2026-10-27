// P-COMP · Entrada del alumno (ADR-004, EXP-01.4)
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const irA = vi.fn();
vi.mock("../../src/modules/shared/cliente/api", async (original) => ({
    ...(await original<typeof import("../../src/modules/shared/cliente/api")>()),
    irA: (ruta: string) => irA(ruta),
}));

import EntrarAlumno from "../../src/modules/alumno/componentes/EntrarAlumno";

const GRUPO = {
    grupoId: "g1",
    alumnos: [
        { id: "a1", avatar: "gato", nombreCorto: "Ana" },
        { id: "a2", avatar: "perro", nombreCorto: "Beto" },
    ],
    iconosPin: [],
};

function respuesta(status: number, cuerpo: unknown) {
    return Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } }));
}

describe("EntrarAlumno", () => {
    let hablar: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        irA.mockReset();
        hablar = vi.fn();
        Object.assign(window, { speechSynthesis: { speak: hablar, cancel: vi.fn(), getVoices: () => [] } });
        globalThis.SpeechSynthesisUtterance ??= class { lang = ""; rate = 1; voice = null; constructor(public text: string) {} } as never;
    });

    async function hastaElPin(fetch: ReturnType<typeof vi.fn>) {
        const u = userEvent.setup();
        render(<EntrarAlumno />);
        await u.type(screen.getByLabelText("Código del grupo"), "demo42");
        await u.click(screen.getByRole("button", { name: /seguir/i }));
        expect(fetch).toHaveBeenCalledWith("/api/v1/auth/alumno/grupo/DEMO42", expect.anything());
        await u.click(await screen.findByRole("button", { name: /ana/i }));
        return u;
    }

    it("código → avatar → 4 íconos y entra", async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => respuesta(200, GRUPO))
            .mockImplementationOnce(() => respuesta(200, { destino: "/alumno" }));
        vi.stubGlobal("fetch", fetch);
        const u = await hastaElPin(fetch);

        expect(screen.getByRole("heading", { name: /toca tu clave secreta/i })).toBeInTheDocument();
        for (const nombre of ["sol", "luna", "pez", "sol"]) await u.click(screen.getByRole("button", { name: nombre }));

        const [, init] = fetch.mock.calls[1];
        expect(JSON.parse(init.body)).toEqual({ grupoId: "g1", alumnoId: "a1", pin: ["sol", "luna", "pez", "sol"] });
        await vi.waitFor(() => expect(irA).toHaveBeenCalledWith("/alumno"));
        // La clave nunca se lee en voz alta
        expect(hablar).not.toHaveBeenCalled();
    });

    it("con clave incorrecta muestra un mensaje amable y limpia los íconos", async () => {
        const fetch = vi.fn()
            .mockImplementationOnce(() => respuesta(200, GRUPO))
            .mockImplementationOnce(() => respuesta(401, { error: { code: "CREDENCIALES_INVALIDAS", message: "¡Casi! Esa no es tu clave. Intenta otra vez." } }));
        vi.stubGlobal("fetch", fetch);
        const u = await hastaElPin(fetch);
        for (const nombre of ["luna", "luna", "luna", "luna"]) await u.click(screen.getByRole("button", { name: nombre }));
        expect(await screen.findByRole("alert")).toHaveTextContent("¡Casi!");
        expect(screen.getByText("0 de 4 dibujos")).toBeInTheDocument();
        expect(irA).not.toHaveBeenCalled();
    });

    it("un código mal escrito no consulta al servidor y el botón de audio lee la instrucción", async () => {
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<EntrarAlumno />);
        expect(screen.getByRole("button", { name: /seguir/i })).toBeDisabled();
        await u.click(screen.getByRole("button", { name: "Escuchar" }));
        expect(hablar).toHaveBeenCalledTimes(1);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("todos los íconos del PIN tienen nombre accesible y tamaño táctil", async () => {
        const fetch = vi.fn().mockImplementationOnce(() => respuesta(200, GRUPO));
        vi.stubGlobal("fetch", fetch);
        await hastaElPin(fetch);
        const iconos = ["sol", "luna", "estrella", "corazón", "árbol", "flor", "pez", "casa", "coche", "pelota", "nube", "manzana"];
        for (const n of iconos) expect(screen.getByRole("button", { name: n }).className).toMatch(/min-h-16/);
    });
});
