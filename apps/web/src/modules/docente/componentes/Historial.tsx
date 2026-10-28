// D3 · Historial (RF-59, EXP-03.5): asignaciones completadas, la más reciente primero.
// Los filtros viven en la URL para poder compartir o recargar la vista (T-03-03-08).
import { useCallback, useEffect, useState } from "react";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";

interface Entrada {
    asignacionId: string;
    actividad: string;
    alumnoId: string;
    alumno: string;
    tema: string;
    completadaEn: string;
    resultadoFinal: string | null;
    nivelInicial: number;
    nivelFinal: number;
    tiempoTotalMs: number;
}
interface Opcion {
    id: string;
    nombre: string;
}

const CAMPOS = ["grupoId", "alumnoId", "temaId", "desde", "hasta"] as const;
type Filtros = Record<(typeof CAMPOS)[number], string>;

function filtrosDeUrl(): Filtros {
    const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return Object.fromEntries(CAMPOS.map((c) => [c, p.get(c) ?? ""])) as Filtros;
}

const minutos = (ms: number) => (ms < 60_000 ? "< 1 min" : `${Math.round(ms / 60_000)} min`);

export default function Historial() {
    const [filtros, setFiltros] = useState<Filtros>(filtrosDeUrl);
    const [grupos, setGrupos] = useState<Opcion[]>([]);
    const [temas, setTemas] = useState<Opcion[]>([]);
    const [alumnos, setAlumnos] = useState<Opcion[]>([]);
    const [items, setItems] = useState<Entrada[] | null>(null);
    const [cursor, setCursor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([api<{ items: Opcion[] }>("GET", "/docente/grupos"), api<{ items: Opcion[] }>("GET", "/catalogo/temas")])
            .then(([g, t]) => {
                setGrupos(g.items);
                setTemas(t.items);
            })
            .catch(() => setError("No se pudieron cargar los filtros."));
    }, []);

    useEffect(() => {
        if (!filtros.grupoId) return setAlumnos([]);
        api<{ items: (Opcion & { apellidos: string })[] }>("GET", `/docente/grupos/${filtros.grupoId}/alumnos`)
            .then((r) => setAlumnos(r.items.map((a) => ({ id: a.id, nombre: `${a.nombre} ${a.apellidos}`.trim() }))))
            .catch(() => setAlumnos([]));
    }, [filtros.grupoId]);

    const consultar = useCallback(async (f: Filtros, despues?: string) => {
        const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
        if (despues) q.set("cursor", despues);
        try {
            const r = await api<{ items: Entrada[]; nextCursor: string | null }>("GET", `/docente/historial?${q}`);
            setItems((prev) => (despues && prev ? [...prev, ...r.items] : r.items));
            setCursor(r.nextCursor);
            setError(null);
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se pudo cargar el historial.");
        }
    }, []);

    useEffect(() => {
        const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
        window.history.replaceState(null, "", q ? `?${q}` : window.location.pathname);
        setItems(null);
        void consultar(filtros);
    }, [filtros, consultar]);

    const cambiar = (campo: keyof Filtros, valor: string) =>
        setFiltros((f) => ({ ...f, [campo]: valor, ...(campo === "grupoId" ? { alumnoId: "" } : {}) }));

    return (
        <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold">Historial de actividades</h1>
            <form className="tarjeta grid gap-3 sm:grid-cols-5" onSubmit={(e) => e.preventDefault()} aria-label="Filtros">
                <div>
                    <label htmlFor="f-grupo" className="etiqueta">Grupo</label>
                    <select id="f-grupo" className="campo" value={filtros.grupoId} onChange={(e) => cambiar("grupoId", e.target.value)}>
                        <option value="">Todos</option>
                        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="f-alumno" className="etiqueta">Alumno</label>
                    <select id="f-alumno" className="campo" value={filtros.alumnoId} disabled={!filtros.grupoId} onChange={(e) => cambiar("alumnoId", e.target.value)}>
                        <option value="">Todos</option>
                        {alumnos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="f-tema" className="etiqueta">Tema</label>
                    <select id="f-tema" className="campo" value={filtros.temaId} onChange={(e) => cambiar("temaId", e.target.value)}>
                        <option value="">Todos</option>
                        {temas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="f-desde" className="etiqueta">Desde</label>
                    <input id="f-desde" type="date" className="campo" value={filtros.desde} onChange={(e) => cambiar("desde", e.target.value)} />
                </div>
                <div>
                    <label htmlFor="f-hasta" className="etiqueta">Hasta</label>
                    <input id="f-hasta" type="date" className="campo" value={filtros.hasta} onChange={(e) => cambiar("hasta", e.target.value)} />
                </div>
            </form>

            {error && <Aviso tipo="error">{error}</Aviso>}
            {!items && !error && <p role="status">Cargando…</p>}
            {items?.length === 0 && <p className="tarjeta text-tinta-suave">No hay actividades completadas con estos filtros.</p>}
            {items && items.length > 0 && (
                <div className="tarjeta overflow-x-auto">
                    <table className="w-full text-left">
                        <caption className="sr-only">Actividades completadas</caption>
                        <thead>
                            <tr className="border-b border-slate-200 text-sm text-tinta-suave">
                                <th scope="col" className="py-2 pr-3">Fecha</th>
                                <th scope="col" className="py-2 pr-3">Alumno</th>
                                <th scope="col" className="py-2 pr-3">Actividad</th>
                                <th scope="col" className="py-2 pr-3">Tema</th>
                                <th scope="col" className="py-2 pr-3">Resultado</th>
                                <th scope="col" className="py-2 pr-3">Nivel</th>
                                <th scope="col" className="py-2">Tiempo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((e) => (
                                <tr key={e.asignacionId} className="border-b border-slate-100">
                                    <td className="py-2 pr-3 whitespace-nowrap">
                                        {new Date(e.completadaEn).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Tijuana" })}
                                    </td>
                                    <td className="py-2 pr-3">{e.alumno}</td>
                                    <td className="py-2 pr-3">{e.actividad}</td>
                                    <td className="py-2 pr-3">{e.tema}</td>
                                    <td className="py-2 pr-3 font-bold">{e.resultadoFinal ? Number(e.resultadoFinal).toFixed(1) : "—"}</td>
                                    <td className="py-2 pr-3">{e.nivelInicial} → {e.nivelFinal}</td>
                                    <td className="py-2">{minutos(e.tiempoTotalMs)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {cursor && <button type="button" className="boton-secundario self-center" onClick={() => consultar(filtros, cursor)}>Cargar más</button>}
        </div>
    );
}
