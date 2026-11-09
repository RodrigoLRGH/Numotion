// P-COMP · Panel docente (RF-14, RF-62, RF-16), ficha con nota rápida (RF-50) y reportes (RF-18).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FichaAlumno from "../../apps/web/src/modules/docente/componentes/FichaAlumno";
import PanelDocente from "../../apps/web/src/modules/docente/componentes/PanelDocente";
import Reportes from "../../apps/web/src/modules/docente/componentes/Reportes";

vi.mock("../../apps/web/src/app/auth", () => ({ useAuth: () => ({ usuario: { id: "d", nombre: "Maestra Luz", rol: "docente" } }) }));

const ALERTA = {
    alertaId: "al1", alumno: { id: "a2", nombre: "Luis R.", avatar: "perro" }, actividad: "Restas 2", tema: "Resta", indice: 0.68,
    senales: { descripcion: ["expresión de frustración en la cámara", "3 errores seguidos"] }, guia: { id: "g1", titulo: "Señales de frustración" },
    alumnoAceptoAyuda: true, atendidaEn: null, creadaEn: "2026-11-04T16:00:00Z",
};
const RESUMEN = {
    fecha: "2026-11-04",
    grupo: { conDiagnosticoHoy: 2, total: 3, distribucion: { positivo: 1, neutral: 0, frustracion: 1, desinteres: 0, sinDatos: 1 }, afectoPositivoProm: 3, afectoNegativoProm: 2.4, dominioPromPorTema: { suma: 3 } },
    temas: [{ clave: "suma", nombre: "Suma" }],
    alumnos: [
        { alumnoId: "a1", nombre: "Ana López", estadoInicial: "positivo", afectoPositivo: 4, afectoNegativo: 1.4, dominioPorTema: { suma: 4 }, observaciones: [], fechaDato: "2026-11-04", sinDatosHoy: false, alertasPendientes: 0, camara: true },
        { alumnoId: "a2", nombre: "Luis R.", estadoInicial: "frustracion", afectoPositivo: 2, afectoNegativo: 3.4, dominioPorTema: { suma: 2 }, observaciones: ["AN alto y dominio bajo en suma"], fechaDato: "2026-11-04", sinDatosHoy: false, alertasPendientes: 1, camara: false },
        { alumnoId: "a3", nombre: "Mia T.", estadoInicial: "neutral", afectoPositivo: null, afectoNegativo: null, dominioPorTema: {}, observaciones: [], fechaDato: "2026-11-01", sinDatosHoy: true, alertasPendientes: 0, camara: true },
    ],
};

function servidor(extra: Record<string, unknown> = {}) {
    const llamadas: { url: string; metodo: string; cuerpo?: unknown }[] = [];
    const rutas: Record<string, unknown> = {
        "GET /api/v1/docente/grupos": { items: [{ id: "g1", nombre: "3A", grado: 3, alumnos: 3 }] },
        "GET /api/v1/docente/grupos/g1/resumen": RESUMEN,
        "GET /api/v1/docente/alertas": { items: [ALERTA] },
        "GET /api/v1/docente/guias/g1": { id: "g1", titulo: "Señales de frustración", pasos: [{ orden: 1, texto: "Acércate con calma" }, { orden: 2, texto: "Reconoce el esfuerzo" }] },
        "POST /api/v1/docente/alertas/al1/atender": {},
        ...extra,
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        llamadas.push({ url, metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
        const hit = rutas[`${metodo} ${url.split("?")[0]}`];
        return hit !== undefined ? new Response(JSON.stringify(hit), { status: 200 }) : new Response(JSON.stringify({ error: { code: "NO_ENCONTRADO", message: "no" } }), { status: 404 });
    }));
    return llamadas;
}

beforeEach(() => {
    // jsdom no implementa EventSource: el panel usa el sondeo de respaldo
    vi.stubGlobal("EventSource", undefined);
});

describe("PanelDocente (D1)", () => {
    it("resumen previo del grupo, alertas con guía y tabla con 'sin datos hoy'", async () => {
        const llamadas = servidor();
        const u = userEvent.setup();
        render(<MemoryRouter><PanelDocente /></MemoryRouter>);
        expect(await screen.findByRole("heading", { name: /Cómo llega tu grupo hoy \(2 de 3 con diagnóstico/ })).toBeInTheDocument();
        expect(screen.getByText(/Afecto positivo promedio/)).toHaveTextContent("3.0");
        const tabla = screen.getByRole("table");
        const mia = within(tabla).getByRole("row", { name: /Mia T\./ });
        expect(mia).toHaveTextContent(/sin datos hoy \(último: 1 nov/);
        expect(within(tabla).getByRole("row", { name: /Luis R\./ })).toHaveTextContent("Frustración");

        await u.click(await screen.findByRole("button", { name: "Ver guía" }));
        expect(await screen.findByText("Acércate con calma")).toBeInTheDocument();
        expect(screen.getByText(/3 errores seguidos/)).toBeInTheDocument();
        await u.type(screen.getByLabelText("Nota rápida (opcional)"), "Lo acompañé");
        await u.click(screen.getByRole("button", { name: /Marcar como atendida/ }));
        expect(llamadas.find((l) => l.url.endsWith("/atender"))?.cuerpo).toEqual({ nota: "Lo acompañé" });
        expect(await screen.findByText(/Sin alertas pendientes/)).toBeInTheDocument();
        expect(screen.getByText(/no sustituyen el criterio docente/)).toBeInTheDocument();
    });
});

describe("FichaAlumno (D4)", () => {
    it("muestra resumen y guarda una nota rápida en 2 clics (texto + Guardar)", async () => {
        const llamadas = servidor({
            "GET /api/v1/docente/alumnos/a1": {
                datos: { id: "a1", nombre: "Ana", apellidos: "López", grupo: "3A", grado: 3, camara: true },
                estadoEmocionalReciente: { estadoInicial: "positivo", afectoPositivo: 4, afectoNegativo: 1.4, fecha: "2026-11-04", observaciones: [], serie: [{ capturadoEn: "2026-11-04T16:00:00Z", estado: "neutral" }] },
                ultimasNotas: [], resumenDesempeno: { completadas: 2, enCurso: 1, pendientes: 0, promedioResultado: 8.5, puntos: 120, nivelGamificacion: 2, racha: { actual: 1, mejor: 3 }, alertasPendientes: 0 },
            },
            "POST /api/v1/docente/alumnos/a1/notas": { id: "n1", fecha: "2026-11-04T16:00:00Z", texto: "Participó", etiqueta: null },
            "GET /api/v1/docente/alertas": { items: [] },
        });
        const u = userEvent.setup();
        render(<MemoryRouter><FichaAlumno alumnoId="a1" /></MemoryRouter>);
        expect(await screen.findByRole("heading", { name: /Ana López/ })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByText(/Resultado promedio/)).toHaveTextContent("8.5");
        await u.type(screen.getByLabelText("Nota rápida"), "Participó");
        await u.click(screen.getByRole("button", { name: "Guardar" }));
        expect(llamadas.find((l) => l.metodo === "POST")?.cuerpo).toEqual({ texto: "Participó", etiqueta: null });
    });
});

describe("Reportes (D6)", () => {
    it("lista temas por índice y enlaza el CSV con los mismos filtros", async () => {
        servidor({
            "GET /api/v1/docente/grupos/g1/reportes/temas": { items: [{ temaId: "t", tema: "Resta", subtema: "Completar la operación · nivel 3", intentos: 40, indiceError: 0.42, indiceFrustracion: 0.31, alumnosAfectados: 9 }] },
        });
        render(<MemoryRouter><Reportes /></MemoryRouter>);
        const fila = await screen.findByRole("row", { name: /Resta/ });
        expect(fila).toHaveTextContent("42 %");
        expect(fila).toHaveTextContent("31 %");
        expect(screen.getByRole("link", { name: "Exportar CSV" })).toHaveAttribute("href", "/api/v1/docente/grupos/g1/reportes/temas.csv?orden=error");
    });
});
