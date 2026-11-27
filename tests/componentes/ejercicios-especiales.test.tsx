// P-COMP-01 (tipos especiales: con letras RF-39, suma con figuras RF-41, colorear RF-44) y la cola
// sin conexión vista desde el componente (EXP-04.9; la persistencia en IndexedDB la cubre P-E2E-05)
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EjercicioColorear } from "../../apps/web/src/modules/alumno/ejercicios/EjercicioColorear";
import { EjercicioNumeroAPalabras, EjercicioSumaFiguras } from "../../apps/web/src/modules/alumno/ejercicios/EjercicioRespuestaLibre";
import ResolverActividad from "../../apps/web/src/modules/alumno/componentes/ResolverActividad";

const base = { id: "e1", nivel: 2, enunciado: "Ejercicio", hashRespuesta: null };

describe("EjercicioNumeroAPalabras", () => {
    it("muestra el número, envía el texto con Enter y lista lo ya intentado", async () => {
        const onResponder = vi.fn();
        const u = userEvent.setup();
        render(<EjercicioNumeroAPalabras ejercicio={{ ...base, tipoInteraccion: "numero_a_palabras", numeroMostrado: 47 }}
            descartadas={["cuarenta y ciete"]} deshabilitado={false} onResponder={onResponder} />);
        expect(screen.getByText("47")).toBeInTheDocument();
        expect(screen.getByText("cuarenta y ciete").tagName).toBe("S");
        expect(screen.getByRole("button", { name: /comprobar/i })).toBeDisabled();
        await u.type(screen.getByLabelText(/con letras/i), "  cuarenta y siete {Enter}");
        expect(onResponder).toHaveBeenCalledWith("cuarenta y siete");
    });
});

describe("EjercicioNumeroAPalabras · serie (RF-39)", () => {
    it("muestra un campo junto a cada número y envía la serie en orden; tras un fallo conserva lo escrito", async () => {
        const onResponder = vi.fn();
        const u = userEvent.setup();
        const ejercicio = { ...base, tipoInteraccion: "numero_a_palabras", numerosMostrados: [47, 105, 8] };
        const { rerender } = render(<EjercicioNumeroAPalabras ejercicio={ejercicio} descartadas={[]} deshabilitado={false} onResponder={onResponder} />);
        const campos = [47, 105, 8].map((n) => screen.getByLabelText(`Escribe el número ${n} con letras`));
        expect(screen.getByText("105")).toBeInTheDocument();
        await u.type(campos[0], "cuarenta y siete");
        await u.type(campos[1], "ciento cinco");
        expect(screen.getByRole("button", { name: /comprobar/i })).toBeDisabled(); // falta uno
        await u.type(campos[2], " ocho {Enter}");
        expect(onResponder).toHaveBeenCalledWith(JSON.stringify(["cuarenta y siete", "ciento cinco", "ocho"]));
        rerender(<EjercicioNumeroAPalabras ejercicio={ejercicio} descartadas={[JSON.stringify(["x"])]} deshabilitado={false} onResponder={onResponder} />);
        expect(screen.getByLabelText("Escribe el número 105 con letras")).toHaveValue("ciento cinco");
    });
});

describe("EjercicioSumaFiguras", () => {
    it("describe cada grupo para lectores de pantalla y solo admite cifras", async () => {
        const onResponder = vi.fn();
        const u = userEvent.setup();
        render(<EjercicioSumaFiguras ejercicio={{ ...base, tipoInteraccion: "suma_figuras", figuras: [{ emoji: "🍎", cantidad: 3 }, { emoji: "⭐", cantidad: 1 }] }}
            descartadas={[]} deshabilitado={false} onResponder={onResponder} />);
        expect(screen.getByRole("img", { name: "Grupo 1: 3 figuras" })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Grupo 2: 1 figura" })).toBeInTheDocument();
        const campo = screen.getByLabelText(/en total/i);
        await u.type(campo, "4a");
        expect(campo).toHaveValue("4");
        await u.click(screen.getByRole("button", { name: /comprobar/i }));
        expect(onResponder).toHaveBeenCalledWith("4");
    });
});

describe("EjercicioColorear", () => {
    const ejercicio = {
        ...base, tipoInteraccion: "colorear_figura",
        lienzo: { figuras: [{ id: "f1", tipo: "triangulo" }, { id: "f2", tipo: "circulo" }, { id: "f3", tipo: "triangulo" }], instruccion: { tipo: "triangulo", color: "rojo" } },
    };

    it("se elige color y se tocan figuras; tocar otra vez despinta; envía el coloreo como JSON", async () => {
        const onResponder = vi.fn();
        const u = userEvent.setup();
        render(<EjercicioColorear ejercicio={ejercicio} descartadas={[]} deshabilitado={false} onResponder={onResponder} />);
        expect(screen.getAllByRole("button", { name: /^(rojo|azul|verde|amarillo|morado|naranja|rosa|café)$/ })).toHaveLength(8);

        // Sin color elegido, tocar una figura no hace nada
        await u.click(screen.getByRole("button", { name: /figura 1/i }));
        expect(screen.getByRole("button", { name: "Figura 1: triángulo, sin color" })).toBeInTheDocument();

        await u.click(screen.getByRole("button", { name: "rojo" }));
        expect(screen.getByRole("button", { name: "rojo" })).toHaveAttribute("aria-pressed", "true");
        await u.click(screen.getByRole("button", { name: /figura 1/i }));
        await u.click(screen.getByRole("button", { name: /figura 2/i }));
        await u.click(screen.getByRole("button", { name: /figura 3/i }));
        expect(screen.getByRole("button", { name: "Figura 2: círculo, pintada de rojo" })).toBeInTheDocument();
        await u.click(screen.getByRole("button", { name: /figura 2/i }));
        expect(screen.getByRole("button", { name: "Figura 2: círculo, sin color" })).toBeInTheDocument();

        await u.click(screen.getByRole("button", { name: /comprobar/i }));
        expect(JSON.parse(onResponder.mock.calls[0][0])).toEqual({ f1: "rojo", f3: "rojo" });
    });
});

describe("ResolverActividad sin validación optimista ni conexión", () => {
    const siguiente = { ejercicio: { ...base, tipoInteraccion: "suma_figuras", figuras: [{ emoji: "🍎", cantidad: 2 }] }, intentosUsados: 0, ayudaUsada: false, actividad: { nombre: "Figuras" }, progreso: { resueltos: 0, total: 1 } };
    const respuesta = (cuerpo: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(cuerpo), { status }));
    const resultado = { correcta: true, puntos: 10, ejercicioCerrado: true, intentosRestantes: 0, guia: null, asignacion: { estado: "en_curso", resueltos: 1, total: 1 }, recompensa: null };

    it("con hashRespuesta null espera al servidor; sin red muestra Guardando… y reenvía el mismo clienteId al reconectar", async () => {
        const enviados: string[] = [];
        let conRed = false;
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
            if (url.endsWith("/iniciar")) return respuesta(siguiente);
            if (!conRed) throw new TypeError("Failed to fetch");
            enviados.push(JSON.parse(String(init!.body)).clienteId);
            return respuesta(resultado, 201);
        }));
        const u = userEvent.setup();
        render(<ResolverActividad asignacionId="a1" />);
        await u.type(await screen.findByLabelText(/en total/i), "2");
        await u.click(screen.getByRole("button", { name: /comprobar/i }));

        expect(await screen.findByText(/guardando/i)).toBeInTheDocument();
        expect(screen.queryByText(/muy bien/i)).toBeNull(); // nada optimista: no hay hash
        expect(screen.queryByRole("alert")).toBeNull(); // no se muestra como error

        conRed = true;
        await act(async () => void window.dispatchEvent(new Event("online")));
        expect(await screen.findByText(/muy bien/i)).toBeInTheDocument();
        expect(screen.queryByText(/guardando/i)).toBeNull();
        expect(enviados).toHaveLength(1);
        expect(enviados[0]).toMatch(/^[0-9a-f-]{36}$/);
    });
});
