// P-COMP · RC-03: solo dispositivos con cámara. Sin cámara el alumno no entra, y la actividad no
// continúa si el navegador la niega o no la encuentra (la cámara está activa para todos los alumnos).
import { createHash } from "node:crypto";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { textoParaHash } from "@numotion/core/dominio/respuesta";
import { RequireCamara } from "../../apps/web/src/app/guardas";
import ResolverActividad from "../../apps/web/src/modules/alumno/componentes/ResolverActividad";
import { simularDispositivos } from "./setup";

function conGuarda() {
    return render(
        <MemoryRouter initialEntries={["/alumno/entrar"]}>
            <Routes>
                <Route element={<RequireCamara />}>
                    <Route path="/alumno/entrar" element={<p>Pantalla de acceso</p>} />
                </Route>
            </Routes>
        </MemoryRouter>,
    );
}

describe("RequireCamara", () => {
    it("con cámara deja pasar", async () => {
        conGuarda();
        expect(await screen.findByText("Pantalla de acceso")).toBeInTheDocument();
    });

    it("sin cámara bloquea y al conectarla deja pasar con «Revisar otra vez»", async () => {
        const dispositivos: { kind: MediaDeviceKind }[] = [{ kind: "audioinput" }];
        simularDispositivos(dispositivos);
        conGuarda();
        expect(await screen.findByRole("heading", { name: "Este dispositivo no tiene cámara" })).toBeInTheDocument();
        expect(screen.queryByText("Pantalla de acceso")).toBeNull();
        dispositivos.push({ kind: "videoinput" });
        await userEvent.click(screen.getByRole("button", { name: "Revisar otra vez" }));
        expect(await screen.findByText("Pantalla de acceso")).toBeInTheDocument();
    });

    it("un navegador sin mediaDevices cuenta como sin cámara", async () => {
        Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
        conGuarda();
        expect(await screen.findByRole("heading", { name: "Este dispositivo no tiene cámara" })).toBeInTheDocument();
    });
});

describe("ResolverActividad pide la cámara siempre", () => {
    const hash = (id: string, v: string) => createHash("sha256").update(textoParaHash(id, v)).digest("hex");
    const siguiente = {
        ejercicio: { id: "e1", tipoInteraccion: "seleccion_multiple", nivel: 2, enunciado: "¿Cuánto es 3 + 4?", opciones: ["6", "7", "8", "12"], hashRespuesta: hash("e1", "7") },
        intentosUsados: 0, ayudaUsada: false, actividad: { nombre: "Sumas" }, progreso: { resueltos: 0, total: 2 },
    };

    it("si el navegador niega la cámara, la actividad se detiene hasta que se permita", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(siguiente), { status: 200 })));
        const getUserMedia = vi.fn().mockRejectedValueOnce(new DOMException("no", "NotAllowedError")).mockReturnValue(new Promise(() => {}));
        simularDispositivos([{ kind: "videoinput" }], { getUserMedia } as Partial<MediaDevices>);
        render(<ResolverActividad asignacionId="a1" />);
        expect(await screen.findByRole("heading", { name: "Necesitamos tu cámara" })).toBeInTheDocument();
        expect(screen.getByText(/no dejó usar la cámara/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "7" })).toBeNull();

        await userEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
        expect(getUserMedia).toHaveBeenCalledTimes(2);
        expect(await screen.findByRole("button", { name: "7" })).toBeInTheDocument();
    });

    it("pide la cámara al abrir la actividad (RC-03, RI-02)", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(siguiente), { status: 200 })));
        const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
        simularDispositivos([{ kind: "videoinput" }], { getUserMedia } as Partial<MediaDevices>);
        render(<ResolverActividad asignacionId="a1" />);
        expect(await screen.findByRole("button", { name: "7" })).toBeInTheDocument();
        expect(getUserMedia).toHaveBeenCalledTimes(1);
    });
});
