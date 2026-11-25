// P-COMP-01 (tipos de ejercicio, operables con táctil/mouse/teclado) y P-COMP-02 (guía paso a paso / final)
import { createHash } from "node:crypto";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const irA = vi.fn();
vi.mock("../../apps/web/src/shared/cliente/api", async (original) => ({
    ...(await original<typeof import("../../apps/web/src/shared/cliente/api")>()),
    irA: (ruta: string) => irA(ruta),
}));

import { EjercicioArrastrar } from "../../apps/web/src/modules/alumno/ejercicios/EjercicioArrastrar";
import { EjercicioOpciones } from "../../apps/web/src/modules/alumno/ejercicios/EjercicioOpciones";
import { GuiaPasoAPaso } from "../../apps/web/src/modules/alumno/componentes/GuiaPasoAPaso";
import ResolverActividad from "../../apps/web/src/modules/alumno/componentes/ResolverActividad";
import { textoParaHash } from "@numotion/core/dominio/respuesta";

const hash = (id: string, v: string) => createHash("sha256").update(textoParaHash(id, v)).digest("hex");
const ejercicio = (extra = {}) => ({
    id: "e1", tipoInteraccion: "seleccion_multiple", nivel: 2, enunciado: "¿Cuánto es 3 + 4?",
    opciones: ["6", "7", "8", "12"], hashRespuesta: hash("e1", "7"), ...extra,
});

beforeEach(() => {
    irA.mockReset();
});

describe("EjercicioOpciones", () => {
    it("responde con un toque o con el teclado y deshabilita las opciones ya intentadas", async () => {
        const onResponder = vi.fn();
        const u = userEvent.setup();
        render(<EjercicioOpciones ejercicio={ejercicio()} descartadas={["6"]} deshabilitado={false} onResponder={onResponder} />);
        expect(screen.getByRole("button", { name: "6, ya intentado" })).toBeDisabled();
        await u.click(screen.getByRole("button", { name: "7" }));
        screen.getByRole("button", { name: "8" }).focus();
        await u.keyboard("{Enter}");
        expect(onResponder.mock.calls).toEqual([["7"], ["8"]]);
    });
});

describe("EjercicioArrastrar", () => {
    const props = (onResponder = vi.fn()) => ({
        ejercicio: ejercicio({ tipoInteraccion: "arrastrar", expresion: "3 + 4 = □" }), descartadas: [] as string[], deshabilitado: false, onResponder,
    });

    it("alternativa sin arrastre: tocar la ficha la pone en el recuadro y Comprobar la envía", async () => {
        const p = props();
        const u = userEvent.setup();
        render(<EjercicioArrastrar {...p} />);
        expect(screen.getByRole("button", { name: /comprobar/i })).toBeDisabled();
        await u.click(screen.getByRole("button", { name: "7" }));
        expect(screen.getByRole("status", { name: "Recuadro: 7" })).toBeInTheDocument();
        await u.click(screen.getByRole("button", { name: /comprobar/i }));
        expect(p.onResponder).toHaveBeenCalledWith("7");
    });

    it("con mouse: arrastrar y soltar en el recuadro", () => {
        const p = props();
        render(<EjercicioArrastrar {...p} />);
        const datos = new Map<string, string>();
        const dataTransfer = { setData: (k: string, v: string) => datos.set(k, v), getData: (k: string) => datos.get(k) ?? "" };
        fireEvent.dragStart(screen.getByRole("button", { name: "12" }), { dataTransfer });
        fireEvent.drop(screen.getByRole("status"), { dataTransfer });
        expect(screen.getByRole("status", { name: "Recuadro: 12" })).toBeInTheDocument();
    });
});

describe("GuiaPasoAPaso", () => {
    const pasos = [1, 2, 3].map((orden) => ({ orden, texto: `Paso ${orden}` }));
    it("paso a paso revela uno a la vez", async () => {
        const u = userEvent.setup();
        render(<GuiaPasoAPaso guia={{ modo: "paso_a_paso", pasos }} onCerrar={vi.fn()} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(1);
        await u.click(screen.getByRole("button", { name: /siguiente paso/i }));
        await u.click(screen.getByRole("button", { name: /siguiente paso/i }));
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
        expect(screen.queryByRole("button", { name: /siguiente paso/i })).toBeNull();
    });
    it("la explicación final muestra todos los pasos y la respuesta", () => {
        render(<GuiaPasoAPaso guia={{ modo: "final", pasos, respuestaCorrecta: "7" }} onCerrar={vi.fn()} />);
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
        expect(screen.getByText("7")).toBeInTheDocument();
    });
});

describe("ResolverActividad", () => {
    const siguiente = (e = ejercicio()) => ({ ejercicio: e, intentosUsados: 0, ayudaUsada: false, actividad: { nombre: "Sumas" }, progreso: { resueltos: 0, total: 2 } });
    const resultado = (extra: object) => ({
        correcta: false, puntos: 0, ejercicioCerrado: false, intentosRestantes: 3, guia: null,
        asignacion: { estado: "en_curso", resueltos: 0, total: 2 }, recompensa: null, ...extra,
    });
    const respuesta = (cuerpo: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(cuerpo), { status }));

    it("da retroalimentación al instante con el hash, abre la guía en el 3.er fallo y envía tiempo y clienteId", async () => {
        let posteo: Record<string, unknown> | null = null;
        let intento = 0;
        const fetch = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/iniciar")) return respuesta(siguiente());
            if (url.endsWith("/intentos")) {
                posteo = JSON.parse(String(init!.body));
                intento++;
                return respuesta(resultado({ intentosRestantes: 4 - intento, guia: intento === 3 ? { modo: "paso_a_paso", pasos: [{ orden: 1, texto: "Cuenta de 3 a 7" }] } : null }), 201);
            }
            return respuesta({}, 404);
        });
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<ResolverActividad asignacionId="a1" />);
        await u.click(await screen.findByRole("button", { name: "6" }));
        expect(await screen.findByText(/casi/i)).toBeInTheDocument();
        expect(posteo).toMatchObject({ asignacionId: "a1", ejercicioId: "e1", respuesta: "6", ayudaSolicitada: false });
        expect(posteo!.clienteId).toMatch(/^[0-9a-f-]{36}$/);
        expect(typeof posteo!.tiempoMs).toBe("number");

        await u.click(screen.getByRole("button", { name: "8" }));
        await u.click(await screen.findByRole("button", { name: "12" }));
        expect(await screen.findByRole("heading", { name: /paso a paso/i })).toBeInTheDocument();
        expect(screen.getByText("Cuenta de 3 a 7")).toBeInTheDocument();
    });

    it("la retroalimentación optimista no espera al servidor (EXP-04.8)", async () => {
        const fetch = vi.fn((url: string) => (url.endsWith("/iniciar") ? respuesta(siguiente()) : new Promise<Response>(() => {})));
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<ResolverActividad asignacionId="a1" />);
        await u.click(await screen.findByRole("button", { name: "7" }));
        expect(await screen.findByText(/muy bien/i)).toBeInTheDocument();
        expect(screen.queryByText(/\+10/)).toBeNull(); // los puntos llegan con la confirmación del servidor
    });

    it("al completar muestra la recompensa con estrellas y puntos", async () => {
        const fetch = vi.fn(async (url: string) => {
            if (url.endsWith("/iniciar")) return respuesta(siguiente());
            return respuesta(resultado({ correcta: true, puntos: 10, ejercicioCerrado: true, intentosRestantes: 0,
                asignacion: { estado: "completada", resueltos: 2, total: 2 }, recompensa: { puntos: 17, estrellas: 2, resultadoFinal: 7.5 } }), 201);
        });
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<ResolverActividad asignacionId="a1" />);
        await u.click(await screen.findByRole("button", { name: "7" }));
        expect(await screen.findByText(/muy bien/i)).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "¡Terminaste!" }, { timeout: 3000 })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "2 de 3 estrellas" })).toBeInTheDocument();
        expect(screen.getByText("+17 puntos")).toBeInTheDocument();
    });

    it("Ayuda abre la guía y marca los intentos siguientes como con ayuda", async () => {
        let posteo: Record<string, unknown> | null = null;
        const fetch = vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/iniciar")) return respuesta(siguiente());
            if (url.endsWith("/guia")) return respuesta({ modo: "paso_a_paso", pasos: [{ orden: 1, texto: "Junta 3 y 4" }] });
            posteo = JSON.parse(String(init!.body));
            return respuesta(resultado({ correcta: true, puntos: 3, ejercicioCerrado: true }), 201);
        });
        vi.stubGlobal("fetch", fetch);
        const u = userEvent.setup();
        render(<ResolverActividad asignacionId="a1" />);
        await u.click(await screen.findByRole("button", { name: /ayuda/i }));
        expect(await screen.findByText("Junta 3 y 4")).toBeInTheDocument();
        await u.click(screen.getByRole("button", { name: /ya entendí/i }));
        await u.click(screen.getByRole("button", { name: "7" }));
        await vi.waitFor(() => expect(posteo).toMatchObject({ ayudaSolicitada: true }));
    });
});
