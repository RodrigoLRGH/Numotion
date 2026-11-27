// P-COMP-03 · Panel, racha, perfil y práctica libre del alumno (EXP-06.3..06.6) y pregunta de ayuda (RF-27).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RachaVisual, type Gamificacion } from "../../apps/web/src/modules/alumno/componentes/Gamificacion";
import { PreguntaAyuda } from "../../apps/web/src/modules/alumno/componentes/CapturaEmocional";
import PanelAlumno from "../../apps/web/src/modules/alumno/componentes/PanelAlumno";
import PerfilAlumno from "../../apps/web/src/modules/alumno/componentes/PerfilAlumno";
import PracticaLibre from "../../apps/web/src/modules/alumno/componentes/PracticaLibre";

const G: Gamificacion = {
    nivel: 3, puntos: 340, puntosNivel: 300, puntosSiguienteNivel: 600, porcentaje: 13,
    personaje: { emoji: "🦊", nombre: "zorro", accesorios: [{ nivel: 2, emoji: "🧢", nombre: "Gorra" }, { nivel: 3, emoji: "🎩", nombre: "Sombrero" }], accesorioActual: { nivel: 3, emoji: "🎩", nombre: "Sombrero" } },
};
const SEMANA = [
    { fecha: "2026-11-02", dia: "L", hecho: true, esHoy: false, futuro: false },
    { fecha: "2026-11-03", dia: "M", hecho: true, esHoy: false, futuro: false },
    { fecha: "2026-11-04", dia: "Mi", hecho: false, esHoy: true, futuro: false },
    { fecha: "2026-11-05", dia: "J", hecho: false, esHoy: false, futuro: true },
    { fecha: "2026-11-06", dia: "V", hecho: false, esHoy: false, futuro: true },
];

function servidor(rutas: Record<string, unknown>) {
    const llamadas: { url: string; metodo: string; cuerpo?: unknown }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        llamadas.push({ url, metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        const clave = `${metodo} ${url.split("?")[0]}`;
        const hit = Object.entries(rutas).find(([k]) => (k.endsWith("*") ? clave.startsWith(k.slice(0, -1)) : k === clave));
        return hit ? new Response(JSON.stringify(hit[1]), { status: 200 }) : new Response(JSON.stringify({ error: { code: "NO_ENCONTRADO", message: "no" } }), { status: 404 });
    }));
    return llamadas;
}

describe("RachaVisual (EXP-06.3)", () => {
    it("muestra días, la semana L–V y la mejor racha", () => {
        render(<RachaVisual actual={2} mejor={7} semana={SEMANA} />);
        expect(screen.getByRole("heading", { name: "Racha: 2 días" })).toBeInTheDocument();
        expect(screen.getByText("Mejor racha: 7 días")).toBeInTheDocument();
        const dias = within(screen.getByRole("list", { name: "Días de esta semana" })).getAllByRole("listitem");
        expect(dias).toHaveLength(5);
        expect(dias[0]).toHaveTextContent("lunes: practicaste");
        expect(dias[2]).toHaveTextContent("hoy, aún puedes practicar");
    });

    it("con racha 0 invita a empezar, nunca en tono negativo", () => {
        render(<RachaVisual actual={0} mejor={3} semana={SEMANA} />);
        expect(screen.getByRole("heading", { name: "¡Empieza una nueva racha hoy!" })).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/perdiste/i);
    });
});

describe("PanelAlumno (RF-63, RF-22)", () => {
    it("personaje, nivel, mensaje del día, racha, actividades y accesos", async () => {
        servidor({
            "GET /api/v1/alumno/panel": { nombre: "Ana López", mensajeMotivacional: "¡Ana, llevas 2 días seguidos! Sigue así 🔥", racha: { actual: 2, mejor: 7, semana: SEMANA }, gamificacion: G, insignias: [{ clave: "x", nombre: "X", descripcion: "", icono: "🎯" }], actividades: { pendientes: 1, enCurso: 0 } },
            "GET /api/v1/alumno/actividades": { items: [] },
        });
        render(<MemoryRouter><PanelAlumno /></MemoryRouter>);
        expect(await screen.findByRole("heading", { name: /Hola, Ana/ })).toBeInTheDocument();
        expect(screen.getByText("¡Ana, llevas 2 días seguidos! Sigue así 🔥")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Tu zorro con sombrero" })).toBeInTheDocument();
        expect(screen.getByText(/Nivel 3/)).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Avance al nivel 4" })).toHaveAttribute("aria-valuenow", "13");
        expect(screen.getByRole("link", { name: /Jugar libre/ })).toHaveAttribute("href", "/alumno/practica");
        expect(screen.getByRole("link", { name: /Mis insignias/ })).toHaveTextContent("(1)");
    });
});

describe("PerfilAlumno (RF-65, EXP-06.4)", () => {
    it("nombre, grado, grupo, nivel e insignias obtenidas y por ganar; sin datos emocionales", async () => {
        servidor({
            "GET /api/v1/alumno/perfil": {
                nombre: "Ana López", grado: 3, grupo: "3A", gamificacion: G, racha: { actual: 2, mejor: 7 },
                insignias: [{ clave: "primera_actividad", nombre: "¡Primer paso!", descripcion: "Completaste tu primera actividad", icono: "🎯", obtenidaEn: "2026-11-01T10:00:00Z" }],
                insigniasPorGanar: [{ clave: "racha_5", nombre: "5 días seguidos", descripcion: "Practica 5 días", icono: "🔥" }],
            },
        });
        render(<MemoryRouter><PerfilAlumno /></MemoryRouter>);
        expect(await screen.findByRole("heading", { name: "Ana López" })).toBeInTheDocument();
        expect(screen.getByText("3.º grado · Grupo 3A")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Mis insignias (1)" })).toBeInTheDocument();
        expect(screen.getByText("¡Primer paso!")).toBeInTheDocument();
        expect(screen.getByText("Por ganar:", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("Sombrero")).toBeInTheDocument();
        expect(document.body.textContent).not.toMatch(/frustraci|emoci|afecto|ranking/i);
    });
});

describe("PracticaLibre (EXP-06.6)", () => {
    it("elige un juego, resuelve 5 ejercicios y al terminar muestra puntos, racha e insignias", async () => {
        const ej = (i: number) => ({ id: `e${i}`, tipoInteraccion: "seleccion_multiple", nivel: 2, enunciado: `${i} + 1`, opciones: [String(i + 1), "0"], hashRespuesta: null });
        const llamadas = servidor({
            "GET /api/v1/alumno/practica": { items: [
                { tipo: "seleccion_multiple", temaId: "r", temaClave: "resta", tema: "Resta", nombre: "Arrastrar y soltar", icono: "✋", recomendado: true },
                { tipo: "seleccion_multiple", temaId: "t", temaClave: "suma", tema: "Suma", nombre: "Selección múltiple", icono: "🔘", recomendado: false },
            ] },
            "POST /api/v1/alumno/practica": { practicaId: "p1", nivel: 2, tema: "Suma", juego: "Selección múltiple", ejercicios: [1, 2, 3, 4, 5].map(ej) },
            "POST /api/v1/alumno/practica/p1/intentos": { correcta: true, ejercicioCerrado: true, intentosRestantes: 0, solucion: null, progreso: { resueltos: 1, total: 5 }, puntos: 3, subioNivel: 2 },
            "POST /api/v1/alumno/practica/p1/completar": { puntos: 15, aciertos: 5, total: 5, racha: { actual: 3, mejor: 3, incremento: true }, nuevasInsignias: [{ clave: "constante", nombre: "Constante", descripcion: "", icono: "🐢" }] },
        });
        const u = userEvent.setup();
        render(<MemoryRouter><PracticaLibre /></MemoryRouter>);
        // RF-03: el tema con dominio bajo va primero y lleva la etiqueta "Recomendado"; los demás siguen disponibles
        const secciones = await screen.findAllByRole("region");
        expect(secciones.map((x) => within(x).getByRole("heading").textContent)).toEqual(["Resta", "Suma"]);
        expect(within(secciones[0]).getByText("Recomendado")).toBeInTheDocument();
        expect(within(secciones[1]).queryByText("Recomendado")).toBeNull();
        await u.click(await screen.findByRole("button", { name: /Selección múltiple/ }));
        for (let i = 1; i <= 5; i++) {
            await u.click(await screen.findByRole("button", { name: String(i + 1) }));
            if (i === 1) expect(await screen.findByText(/\+3 puntos/)).toBeInTheDocument(); // RF-03: puntos por acierto
            await u.click(await screen.findByRole("button", { name: i === 5 ? /Terminar/ : /Siguiente/ }));
        }
        expect(await screen.findByRole("heading", { name: "¡Terminaste el juego!" })).toBeInTheDocument();
        expect(screen.getByText("+15 puntos")).toBeInTheDocument();
        expect(screen.getByText("¡Tu racha creció a 3 días!")).toBeInTheDocument();
        expect(screen.getByText(/Nueva insignia: Constante/)).toBeInTheDocument();
        expect(screen.getByText(/Subiste al nivel 2/)).toBeInTheDocument(); // el nivel que subió durante el juego
        expect(llamadas.filter((l) => l.url.endsWith("/intentos"))).toHaveLength(5);
        expect(llamadas.at(-1)?.url).toBe("/api/v1/alumno/practica/p1/completar");
    });
});

describe("PreguntaAyuda (RF-27)", () => {
    it("ofrece Sí / No, yo puedo", async () => {
        const onResponder = vi.fn();
        render(<PreguntaAyuda oferta={{ mensaje: "¿Quieres que te ayude? Vamos paso a paso." }} onResponder={onResponder} />);
        await userEvent.click(screen.getByRole("button", { name: /No, yo puedo/ }));
        expect(onResponder).toHaveBeenCalledWith(false);
        await userEvent.click(screen.getByRole("button", { name: /Sí/ }));
        expect(onResponder).toHaveBeenLastCalledWith(true);
    });
});
