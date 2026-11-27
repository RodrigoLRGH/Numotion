// D6 · Reporte grupal (RF-18, EXP-07.6): por tema/subtema, ejercicios, aciertos, errores e índice de
// error en un periodo, de todo el grupo o de un alumno. Las filas llegan ordenadas por índice de error.
import { useEffect, useState } from "react";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { Ayuda } from "../../../shared/ui/Ayuda";

interface Fila {
    temaId: string;
    tema: string;
    subtema: string;
    ejercicios: number;
    aciertos: number;
    errores: number;
    intentos: number;
    indiceError: number;
}
interface Grupo {
    id: string;
    nombre: string;
}
interface Alumno {
    id: string;
    nombre: string;
    apellidos?: string | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const FILTRO = "flex min-h-11 items-center gap-3 rounded-2xl bg-superficie py-1.5 pr-2 pl-4 text-lg";
const CONTROL = "cursor-pointer rounded-xl bg-white px-3 py-1 text-base";
// Celdas en píldora (Figma): el color va en un bloque interior para que rowSpan/colSpan no lo deformen
const PILDORA = "flex min-h-12 items-center justify-center rounded-full px-4 py-2";
const ENCABEZADO = `${PILDORA} bg-marca-claro font-bold`;

const AYUDA_INDICE = <>Porcentaje de intentos incorrectos sobre el total de intentos de ese tema/subtema. La tabla se ordena de mayor a menor.</>;

export default function Reportes() {
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [alumnos, setAlumnos] = useState<Alumno[]>([]);
    const [f, setF] = useState({ grupoId: "", alumnoId: "", desde: "", hasta: "" });
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

    useEffect(() => {
        setAlumnos([]);
        if (!f.grupoId) return;
        api<{ items: Alumno[] }>("GET", `/docente/grupos/${f.grupoId}/alumnos`)
            .then((r) => setAlumnos(r.items))
            .catch(() => setAlumnos([]));
    }, [f.grupoId]);

    const params = new URLSearchParams(Object.entries({ alumnoId: f.alumnoId, desde: f.desde, hasta: f.hasta }).filter(([, v]) => v)).toString();
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
            <h1 className="titulo-pagina">Reporte</h1>
            {/* Filtros en píldora gris con el control blanco dentro (Figma "Grupo:", "Alumno (s):", "Fecha:") */}
            <form className="mt-4 flex flex-wrap items-center gap-4" onSubmit={(e) => e.preventDefault()}>
                <label className={FILTRO}>Grupo:
                    <select className={`${CONTROL} min-w-44`} value={f.grupoId} onChange={(e) => setF({ ...f, grupoId: e.target.value, alumnoId: "" })}>
                        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                    </select>
                </label>
                <label className={FILTRO}>Alumno (s):
                    <select className={`${CONTROL} min-w-56`} value={f.alumnoId} onChange={(e) => setF({ ...f, alumnoId: e.target.value })}>
                        <option value="">Todo el grupo</option>
                        {alumnos.map((a) => <option key={a.id} value={a.id}>{[a.nombre, a.apellidos].filter(Boolean).join(" ")}</option>)}
                    </select>
                </label>
                <fieldset className={`${FILTRO} lg:ml-auto`}>
                    <legend className="float-left font-bold">Fecha:</legend>
                    <label className="flex items-center gap-2">
                        <span className="sr-only">Desde</span>
                        <input type="date" className={CONTROL} value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
                    </label>
                    <span aria-hidden="true">a</span>
                    <label className="flex items-center gap-2">
                        <span className="sr-only">Hasta</span>
                        <input type="date" className={CONTROL} value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
                    </label>
                </fieldset>
            </form>
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!filas && !error && f.grupoId && <p role="status">Generando reporte…</p>}
            {filas && filas.length === 0 && <p className="tarjeta text-tinta-suave">No hay intentos registrados en el periodo.</p>}
            {filas && filas.length > 0 && (
                <section className="overflow-x-auto" aria-label="Resultados del reporte">
                    <table className="w-full border-separate border-spacing-x-4 border-spacing-y-3 text-center text-lg">
                        <thead className="text-base">
                            <tr>
                                <th scope="col" className="min-w-64 align-bottom"><div className={`${ENCABEZADO} text-lg`}>Tema/Subtema</div></th>
                                <th scope="col" className="align-bottom"><div className={ENCABEZADO}>No. Ejercicios</div></th>
                                <th scope="col" className="align-bottom"><div className={ENCABEZADO}>No. Aciertos</div></th>
                                <th scope="col" className="align-bottom"><div className={ENCABEZADO}>No. Errores</div></th>
                                <th scope="col" className="align-bottom">
                                    <div className={ENCABEZADO}>
                                        <Ayuda etiqueta="Índice de error: qué significa" texto={AYUDA_INDICE}>Índice de error</Ayuda>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((x, i) => {
                                const celda = `${PILDORA} ${i % 2 === 0 ? "bg-marca-tenue" : "bg-marca-suave"}`;
                                return (
                                    <tr key={`${x.temaId}-${x.subtema}`}>
                                        <th scope="row" className="font-normal"><div className={celda}>{x.tema}: {x.subtema}</div></th>
                                        <td><div className={celda}>{x.ejercicios}</div></td>
                                        <td><div className={celda}>{x.aciertos}</div></td>
                                        <td><div className={celda}>{x.errores}</div></td>
                                        <td><div className={`${celda} font-bold`}>{pct(x.indiceError)}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}
