// P-COMP · Panel docente (RF-14, RF-62, RF-16), ficha con nota rápida (RF-50) y reportes (RF-18).
import { act, render, screen, within } from "@testing-library/react";
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
    it("resumen previo del grupo y lista de estados con 'sin datos hoy', sin alertas ni detalle por alumno", async () => {
        const llamadas = servidor();
        render(<MemoryRouter><PanelDocente /></MemoryRouter>);
        expect(await screen.findByRole("heading", { name: "Gráfica global" })).toBeInTheDocument();
        expect(screen.getByText(/2 de 3 con diagnóstico/)).toBeInTheDocument();
        // Bajo la gráfica ya no se muestran los promedios de afecto ni de dominio
        expect(screen.queryByText(/Afecto positivo promedio/)).not.toBeInTheDocument();
        const lista = within(screen.getByRole("region", { name: /Alumnos/ })).getAllByRole("listitem");
        expect(lista.find((li) => li.textContent?.includes("Mia T."))).toHaveTextContent(/Sin datos hoy/);
        expect(lista.find((li) => li.textContent?.includes("Luis R."))).toHaveTextContent("Frustración");
        expect(screen.getByRole("link", { name: "Luis R." })).toHaveAttribute("href", "/docente/alumnos/a2");
        // El detalle por alumno se movió a Retroalimentaciones
        expect(screen.queryByRole("heading", { name: "Detalle por alumno" })).not.toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.getByText(/no sustituyen el criterio docente/)).toBeInTheDocument();

        // El panel ya no muestra ni consulta alertas
        expect(screen.queryByText(/alertas? activas?/i)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Ver guía" })).not.toBeInTheDocument();
        expect(llamadas.some((l) => l.url.includes("/docente/alertas"))).toBe(false);
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

    it("pestaña Notas: edita y borra (con confirmación) solo las notas propias", async () => {
        const NOTAS = [
            { id: "n1", fecha: "2026-11-04T16:00:00Z", texto: "Participó en clase", etiqueta: "academico", propia: true },
            { id: "n2", fecha: "2026-11-03T16:00:00Z", texto: "Nota de otra maestra", etiqueta: null, propia: false },
        ];
        const llamadas = servidor({
            "GET /api/v1/docente/alumnos/a1": {
                datos: { id: "a1", nombre: "Ana", apellidos: "López", grupo: "3A", grado: 3, camara: true },
                estadoEmocionalReciente: { estadoInicial: "positivo", afectoPositivo: 4, afectoNegativo: 1.4, fecha: "2026-11-04", observaciones: [], serie: [] },
                ultimasNotas: [], resumenDesempeno: { completadas: 0, enCurso: 0, pendientes: 0, promedioResultado: null, puntos: 0, nivelGamificacion: 1, racha: { actual: 0, mejor: 0 }, alertasPendientes: 0 },
            },
            "GET /api/v1/docente/alumnos/a1/notas": { items: NOTAS },
            "PUT /api/v1/docente/alumnos/a1/notas/n1": { ...NOTAS[0], texto: "Participó mucho", etiqueta: "conducta" },
            "DELETE /api/v1/docente/alumnos/a1/notas/n1": {},
            "GET /api/v1/docente/alertas": { items: [] },
        });
        const u = userEvent.setup();
        render(<MemoryRouter><FichaAlumno alumnoId="a1" /></MemoryRouter>);
        await u.click(await screen.findByRole("tab", { name: "Notas" }));
        expect(await screen.findByText("Participó en clase")).toBeInTheDocument();

        // La nota ajena no tiene acciones
        expect(screen.getAllByRole("button", { name: /^Editar la nota/ })).toHaveLength(1);
        expect(screen.getAllByRole("button", { name: /^Borrar la nota/ })).toHaveLength(1);

        // Editar: cancelar no envía nada; guardar envía texto y etiqueta nuevos
        await u.click(screen.getByRole("button", { name: /Editar la nota «Participó en clase/ }));
        const campo = screen.getByLabelText("Texto de la nota");
        expect(campo).toHaveValue("Participó en clase");
        await u.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(llamadas.some((l) => l.metodo === "PUT")).toBe(false);

        await u.click(screen.getByRole("button", { name: /Editar la nota «Participó en clase/ }));
        await u.clear(screen.getByLabelText("Texto de la nota"));
        await u.type(screen.getByLabelText("Texto de la nota"), "Participó mucho");
        await u.selectOptions(within(screen.getByRole("form", { name: "Editar nota" })).getByLabelText("Etiqueta"), "conducta");
        await u.click(screen.getByRole("button", { name: /Guardar cambios/ }));
        expect(llamadas.find((l) => l.metodo === "PUT")).toMatchObject({ url: "/api/v1/docente/alumnos/a1/notas/n1", cuerpo: { texto: "Participó mucho", etiqueta: "conducta" } });

        // Borrar: pide confirmación; cancelar no borra, "Sí, borrar" sí
        await u.click(await screen.findByRole("button", { name: /Borrar la nota «Participó en clase/ }));
        expect(screen.getByText(/¿Borrar esta nota\?/)).toBeInTheDocument();
        await u.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(llamadas.some((l) => l.metodo === "DELETE")).toBe(false);
        await u.click(screen.getByRole("button", { name: /Borrar la nota «Participó en clase/ }));
        await u.click(screen.getByRole("button", { name: "Sí, borrar" }));
        expect(llamadas.find((l) => l.metodo === "DELETE")?.url).toBe("/api/v1/docente/alumnos/a1/notas/n1");
        // Tras cada cambio se recarga la lista
        expect(llamadas.filter((l) => l.metodo === "GET" && l.url === "/api/v1/docente/alumnos/a1/notas").length).toBeGreaterThanOrEqual(3);
    });
});

describe("Reportes (D6)", () => {
    it("muestra ejercicios, aciertos, errores e índice de error, sin aspectos emocionales; filtra por alumno; sin exportar CSV", async () => {
        const llamadas = servidor({
            "GET /api/v1/docente/grupos/g1/alumnos": { items: [{ id: "a1", nombre: "Ana", apellidos: "López" }] },
            "GET /api/v1/docente/grupos/g1/reportes/temas": {
                items: [
                    { temaId: "t", tema: "Fracciones", subtema: "División de fracciones", ejercicios: 12, aciertos: 10, errores: 2, intentos: 16, indiceError: 0.13 },
                    { temaId: "u", tema: "Resta", subtema: "Completar la operación · nivel 3", ejercicios: 3, aciertos: 2, errores: 1, intentos: 4, indiceError: 0.25 },
                ],
            },
        });
        render(<MemoryRouter><Reportes /></MemoryRouter>);
        const fila = await screen.findByRole("row", { name: /Fracciones: División de fracciones/ });
        const celdas = within(fila).getAllByRole("cell").map((c) => c.textContent);
        expect(celdas).toEqual(["12", "10", "2", "13%"]);
        expect(screen.getByRole("columnheader", { name: /Índice de error/ })).toBeInTheDocument();
        expect(screen.queryByRole("columnheader", { name: /Aspectos|Positivos|Negativos/ })).toBeNull();
        expect(screen.queryByRole("link", { name: /Exportar CSV/ })).not.toBeInTheDocument();

        await userEvent.selectOptions(await screen.findByRole("combobox", { name: /Alumno/ }), await screen.findByRole("option", { name: "Ana López" }));
        expect(llamadas.some((l) => l.url.endsWith("/reportes/temas?alumnoId=a1"))).toBe(true);
    });
});
