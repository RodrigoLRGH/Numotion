// D1 · Panel docente: resumen previo del grupo (RF-14, RF-62) y alertas tempranas (RF-16, RF-27).
// Para el grupo elegido: cuántos alumnos ya hicieron el diagnóstico hoy, distribución del estado
// inicial, AP/AN y dominio promedio; por alumno, su último dato ("sin datos hoy" con la fecha, A-09).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../app/auth";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { AvisoAlertaNueva, ListaAlertas, useAlertas } from "./Alertas";
import { AVISO_ESTIMACION, Barra, ESTADO, EtiquetaEstado, fechaCorta } from "./estados";

interface Grupo {
    id: string;
    nombre: string;
    grado: number;
    alumnos: number;
}
interface AlumnoResumen {
    alumnoId: string;
    nombre: string;
    estadoInicial: string | null;
    afectoPositivo: number | null;
    afectoNegativo: number | null;
    dominioPorTema: Record<string, number>;
    observaciones: string[];
    fechaDato: string | null;
    sinDatosHoy: boolean;
    alertasPendientes: number;
    camara: boolean;
}
interface Resumen {
    fecha: string;
    grupo: {
        conDiagnosticoHoy: number;
        total: number;
        distribucion: Record<string, number>;
        afectoPositivoProm: number | null;
        afectoNegativoProm: number | null;
        dominioPromPorTema: Record<string, number>;
    };
    temas: { clave: string; nombre: string }[];
    alumnos: AlumnoResumen[];
}

const CLAVE_GRUPO = "numotion.docente.grupo";
const leerGrupo = () => {
    try {
        return localStorage.getItem(CLAVE_GRUPO);
    } catch {
        return null;
    }
};

const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(1));

export default function PanelDocente() {
    const { usuario } = useAuth();
    const [grupos, setGrupos] = useState<Grupo[] | null>(null);
    const [grupoId, setGrupoId] = useState<string>("");
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [error, setError] = useState<string | null>(null);
    const alertas = useAlertas();

    useEffect(() => {
        api<{ items: Grupo[] }>("GET", "/docente/grupos")
            .then((r) => {
                setGrupos(r.items);
                const guardado = leerGrupo();
                setGrupoId(r.items.find((g) => g.id === guardado)?.id ?? r.items[0]?.id ?? "");
            })
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar tus grupos."));
    }, []);

    useEffect(() => {
        if (!grupoId) return;
        try {
            localStorage.setItem(CLAVE_GRUPO, grupoId);
        } catch {
            // sin almacenamiento: solo no se recuerda el grupo
        }
        setResumen(null);
        api<Resumen>("GET", `/docente/grupos/${grupoId}/resumen`)
            .then(setResumen)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudo cargar el resumen."));
    }, [grupoId]);

    const alertasGrupo = resumen ? alertas.items.filter((a) => resumen.alumnos.some((x) => x.alumnoId === a.alumno.id)) : alertas.items;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className="flex-grow text-2xl font-extrabold">Hola, {usuario?.nombre}</h1>
                {grupos && grupos.length > 0 && (
                    <label className="flex items-center gap-2 font-bold">
                        Grupo
                        <select className="campo w-auto" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                            {grupos.map((g) => (
                                <option key={g.id} value={g.id}>{g.nombre} · {g.grado}.º</option>
                            ))}
                        </select>
                    </label>
                )}
                <span className="insignia-estado bg-alerta-suave text-alerta" aria-live="polite">
                    <span aria-hidden="true">🔔 </span>{alertasGrupo.length} {alertasGrupo.length === 1 ? "alerta" : "alertas"}
                </span>
            </div>

            {error && <Aviso tipo="error">{error}</Aviso>}
            {grupos && grupos.length === 0 && (
                <section className="tarjeta">
                    <p>Aún no tienes grupos.</p>
                    <Link to="/docente/grupos" className="boton mt-3">Crear un grupo</Link>
                </section>
            )}

            {resumen && <ResumenPrevio r={resumen} />}

            <section id="alertas" aria-labelledby="titulo-alertas" className="tarjeta">
                <h2 id="titulo-alertas" className="mb-3 text-xl font-extrabold"><span aria-hidden="true">⚠ </span>Alertas activas</h2>
                <ListaAlertas alertas={alertasGrupo} onQuitar={alertas.quitar} />
            </section>

            {resumen && <TablaAlumnos r={resumen} />}
            <p className="text-sm text-tinta-suave">{AVISO_ESTIMACION}</p>
            <AvisoAlertaNueva alerta={alertas.nueva} onCerrar={alertas.descartarNueva} />
        </div>
    );
}

function ResumenPrevio({ r }: { r: Resumen }) {
    const g = r.grupo;
    const filas = [...(["positivo", "neutral", "frustracion", "desinteres"] as const).map((k) => ({ k, n: g.distribucion[k] ?? 0 })), { k: "sin_dato" as const, n: g.distribucion.sinDatos ?? 0 }];
    return (
        <section aria-labelledby="como-llega" className="tarjeta">
            <h2 id="como-llega" className="text-xl font-extrabold">
                Cómo llega tu grupo hoy <span className="font-semibold text-tinta-suave">({g.conDiagnosticoHoy} de {g.total} con diagnóstico · {fechaCorta(r.fecha)})</span>
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {filas.map(({ k, n }) => (
                    <li key={k} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2">
                        <span>{ESTADO[k].icono} {k === "sin_dato" ? "Sin datos hoy" : ESTADO[k].texto}</span>
                        <Barra valor={n} max={Math.max(1, g.total)} etiqueta={`${n} de ${g.total}`} clase={k === "frustracion" ? "bg-alerta" : k === "positivo" ? "bg-exito" : k === "sin_dato" ? "bg-slate-400" : "bg-marca"} />
                        <span className="text-right font-bold">{n}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-3">
                Afecto positivo promedio <strong>{fmt(g.afectoPositivoProm)}</strong> · Afecto negativo promedio <strong>{fmt(g.afectoNegativoProm)}</strong> <span className="text-tinta-suave">(escala 1–5)</span>
            </p>
            {Object.keys(g.dominioPromPorTema).length > 0 && (
                <p className="mt-1">
                    Dominio promedio:{" "}
                    {r.temas.filter((t) => t.clave in g.dominioPromPorTema).map((t) => (
                        <span key={t.clave} className="mr-3 whitespace-nowrap">{t.nombre} <strong>{g.dominioPromPorTema[t.clave]}</strong>/5</span>
                    ))}
                </p>
            )}
        </section>
    );
}

function TablaAlumnos({ r }: { r: Resumen }) {
    return (
        <section aria-labelledby="titulo-alumnos" className="tarjeta overflow-x-auto">
            <h2 id="titulo-alumnos" className="mb-3 text-xl font-extrabold">Alumnos</h2>
            {r.alumnos.length === 0 ? (
                <p className="text-tinta-suave">Este grupo no tiene alumnos activos.</p>
            ) : (
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th scope="col" className="py-2 pr-3">Alumno</th>
                            <th scope="col" className="pr-3">Estado inicial</th>
                            <th scope="col" className="pr-3"><abbr title="Afecto positivo (1–5)">AP</abbr></th>
                            <th scope="col" className="pr-3"><abbr title="Afecto negativo (1–5)">AN</abbr></th>
                            {r.temas.map((t) => (
                                <th key={t.clave} scope="col" className="pr-3">{t.nombre}</th>
                            ))}
                            <th scope="col" className="pr-3">Cámara</th>
                            <th scope="col"><span className="sr-only">Acciones</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {r.alumnos.map((a) => (
                            <tr key={a.alumnoId} className="border-b border-slate-100 align-top">
                                <th scope="row" className="py-2 pr-3 font-semibold">
                                    {a.nombre}
                                    {a.alertasPendientes > 0 && <span className="ml-2 insignia-estado bg-alerta-suave text-alerta">⚠ {a.alertasPendientes}</span>}
                                    {a.observaciones.length > 0 && <p className="text-sm font-normal text-tinta-suave">{a.observaciones.join(" · ")}</p>}
                                </th>
                                {a.sinDatosHoy ? (
                                    <td colSpan={3 + r.temas.length} className="pr-3 text-tinta-suave">
                                        ░ sin datos hoy{a.fechaDato ? ` (último: ${fechaCorta(a.fechaDato)})` : ""}
                                    </td>
                                ) : (
                                    <>
                                        <td className="pr-3"><EtiquetaEstado estado={a.estadoInicial} /></td>
                                        <td className="pr-3">{fmt(a.afectoPositivo)}</td>
                                        <td className="pr-3">{fmt(a.afectoNegativo)}</td>
                                        {r.temas.map((t) => (
                                            <td key={t.clave} className="pr-3">{a.dominioPorTema[t.clave] ?? "—"}</td>
                                        ))}
                                    </>
                                )}
                                <td className="pr-3">{a.camara ? "Sí" : <span className="text-tinta-suave">Sin cámara</span>}</td>
                                <td><Link to={`/docente/alumnos/${a.alumnoId}`} className="font-bold text-marca underline">Ver</Link></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
