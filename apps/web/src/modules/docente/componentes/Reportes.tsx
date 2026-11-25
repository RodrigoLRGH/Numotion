// D6 · Reporte grupal (RF-18, EXP-07.6): temas y habilidades con mayor índice de error en un
// periodo, exportable a CSV (la exportación queda auditada).
import { useEffect, useState } from "react";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { Barra } from "./estados";

interface Fila {
    temaId: string;
    tema: string;
    subtema: string;
    intentos: number;
    indiceError: number;
    alumnosAfectados: number;
}
interface Grupo {
    id: string;
    nombre: string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

export default function Reportes() {
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [f, setF] = useState({ grupoId: "", desde: "", hasta: "" });
    const [filas, setFilas] = useState<Fila[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<{ items: Grupo[] }>("GET", "/docente/grupos")
            .then((r) => {
                setGrupos(r.items);
                setF((x) => ({ ...x, grupoId: x.grupoId || r.items[0]?.id || "" }));
            })
            .catch(() => setError("No se pudieron cargar tus grupos."));
    }, []);

    const params = new URLSearchParams(Object.entries({ desde: f.desde, hasta: f.hasta }).filter(([, v]) => v)).toString();
    const consulta = params ? `?${params}` : "";

    useEffect(() => {
        if (!f.grupoId) return;
        setFilas(null);
        api<{ items: Fila[] }>("GET", `/docente/grupos/${f.grupoId}/reportes/temas${consulta}`)
            .then((r) => {
                setFilas(r.items);
                setError(null);
            })
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudo generar el reporte."));
    }, [f.grupoId, consulta]);

    return (
        <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold">Reporte de temas con más dificultad</h1>
            <form className="tarjeta grid gap-3 sm:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
                <label><span className="etiqueta">Grupo</span>
                    <select className="campo" value={f.grupoId} onChange={(e) => setF({ ...f, grupoId: e.target.value })}>
                        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                    </select>
                </label>
                <label><span className="etiqueta">Desde</span>
                    <input type="date" className="campo" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
                </label>
                <label><span className="etiqueta">Hasta</span>
                    <input type="date" className="campo" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
                </label>
                <div className="flex items-end">
                    {f.grupoId && (
                        <a className="boton-secundario w-full" href={`/api/v1/docente/grupos/${f.grupoId}/reportes/temas.csv${consulta}`} download>
                            Exportar CSV
                        </a>
                    )}
                </div>
            </form>
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!filas && !error && f.grupoId && <p role="status">Generando reporte…</p>}
            {filas && filas.length === 0 && <p className="tarjeta text-tinta-suave">No hay intentos registrados en el periodo.</p>}
            {filas && filas.length > 0 && (
                <section className="tarjeta overflow-x-auto" aria-label="Resultados del reporte">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <th scope="col" className="py-2 pr-3">Tema</th>
                                <th scope="col" className="pr-3">Subtema / habilidad</th>
                                <th scope="col" className="pr-3">Intentos</th>
                                <th scope="col" className="min-w-40 pr-3">Índice de error</th>
                                <th scope="col">Alumnos con errores</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((x) => (
                                <tr key={`${x.temaId}-${x.subtema}`} className="border-b border-slate-100">
                                    <th scope="row" className="py-2 pr-3">{x.tema}</th>
                                    <td className="pr-3">{x.subtema}</td>
                                    <td className="pr-3">{x.intentos}</td>
                                    <td className="pr-3"><div className="flex items-center gap-2"><Barra valor={x.indiceError} max={1} etiqueta={`Error ${pct(x.indiceError)}`} clase="bg-marca" /><span className="w-12 text-right font-bold">{pct(x.indiceError)}</span></div></td>
                                    <td>{x.alumnosAfectados}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
