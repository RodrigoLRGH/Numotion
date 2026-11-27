// D4 · Ficha del alumno (RF-29, RF-19, RF-52, RF-35, RF-50): resumen, perfil estadístico, cruce
// emoción-desempeño, resultados académicos (captura + consolidado) y notas rápidas.
// Cada apertura queda auditada en el servidor (EXP-07.2).
import { ArrowLeft, Check, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { ListaAlertas, useAlertas } from "./Alertas";
import { AVISO_ESTIMACION, Barra, ESTADO, EtiquetaEstado, fechaCorta, fechaHora, ICONO, IconoEstado } from "./estados";

interface Nota {
    id: string;
    fecha: string;
    texto: string;
    etiqueta: string | null;
    propia: boolean;
}
interface Ficha {
    datos: { id: string; nombre: string; apellidos: string; grupo: string; grado: number; camara: boolean };
    estadoEmocionalReciente: {
        estadoInicial: string | null;
        afectoPositivo: number | null;
        afectoNegativo: number | null;
        fecha: string | null;
        observaciones: string[];
        serie: { capturadoEn: string; estado: string }[];
    };
    ultimasNotas: Nota[];
    resumenDesempeno: {
        completadas: number;
        enCurso: number;
        pendientes: number;
        promedioResultado: number | null;
        puntos: number;
        nivelGamificacion: number;
        racha: { actual: number; mejor: number };
        alertasPendientes: number;
    };
}
interface PerfilTema {
    temaId: string;
    tema: string;
    ejercicios: number;
    tiempoPromedioMs: number | null;
    intentosPromedio: number | null;
    porcentajeAciertos: number | null;
    erroresPorTipo: Record<string, number>;
    habilidadesMenorDominio: { habilidad: string; porcentajeAciertos: number; intentos: number }[];
}
interface Resultado {
    id: string;
    tema: string;
    tipo: string;
    titulo: string;
    calificacion: number;
    fecha: string;
}
interface Consolidado {
    temaId: string;
    tema: string;
    porTipo: Record<string, number>;
    promedio: number;
    registros: number;
}
interface SesionCruce {
    fecha: string;
    nivelDominio: number;
    porcentajeAciertos: number;
    afectoPositivo: number;
    afectoNegativo: number;
}
interface Cruce {
    temaId: string;
    tema: string;
    ultima: SesionCruce;
    sesiones: number;
    dominioPromedio: number;
    afectoPositivoProm: number;
    afectoNegativoProm: number;
    historial: SesionCruce[];
    coincidencia: boolean;
}

const PESTANAS = [
    { id: "resumen", texto: "Resumen" },
    { id: "perfil", texto: "Perfil estadístico" },
    { id: "cruce", texto: "Cruce emoción-desempeño" },
    { id: "resultados", texto: "Resultados" },
    { id: "notas", texto: "Notas" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];

const TIPO_RESULTADO: Record<string, string> = { tarea: "Tarea", trabajo_clase: "Trabajo en clase", interrogacion: "Interrogación", actividad_numotion: "Actividad Numotion" };
const TIPO_ERROR: Record<string, string> = { calculo: "Cálculo", procedimiento: "Procedimiento", lectura: "Lectura", ortografia: "Ortografía", seleccion: "Selección", tiempo_agotado: "Tiempo", otro: "Otro" };
const ETIQUETAS = [
    { id: "", texto: "Sin etiqueta" },
    { id: "academico", texto: "Académico" },
    { id: "emocional", texto: "Emocional" },
    { id: "conducta", texto: "Conducta" },
    { id: "otro", texto: "Otro" },
];
const segundos = (ms: number | null) => (ms === null ? "—" : `${Math.round(ms / 1000)} s`);

/** Dato en píldora celeste (Figma "Detalles de Resolución") */
const PILDORA = "rounded-full bg-marca-suave px-4 py-1.5";
/** Celda en píldora de las tablas de Figma (Estadísticas) */
const CELDA = "rounded-full px-4 py-2";

export default function FichaAlumno({ alumnoId }: { alumnoId: string }) {
    const [ficha, setFicha] = useState<Ficha | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pestana, setPestana] = useState<Pestana>("resumen");
    const alertas = useAlertas();

    const cargar = useCallback(() => {
        api<Ficha>("GET", `/docente/alumnos/${alumnoId}`)
            .then(setFicha)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudo abrir la ficha."));
    }, [alumnoId]);
    useEffect(cargar, [cargar]);

    if (error) return <Aviso tipo="error">{error}</Aviso>;
    if (!ficha) return <p role="status">Cargando ficha…</p>;
    const e = ficha.estadoEmocionalReciente;
    const suyas = alertas.items.filter((a) => a.alumno.id === alumnoId);

    return (
        <div className="flex flex-col gap-4">
            <Link to="/docente" className="inline-flex items-center gap-1 self-start enlace"><ArrowLeft aria-hidden="true" className={ICONO} />Volver al panel</Link>
            <h1 className="titulo-pagina">Información del alumno</h1>
            <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">
                    Nombre del alumno: <span className="font-normal">{ficha.datos.nombre} {ficha.datos.apellidos} · {ficha.datos.grupo}</span>
                </h2>
                <p className="flex flex-wrap items-center gap-2">
                    <strong>Fecha:</strong> {e.fecha ? fechaCorta(e.fecha) : "sin datos"} <EtiquetaEstado estado={e.estadoInicial} />
                </p>
            </header>

            {suyas.length > 0 && (
                <section className="tarjeta" aria-label="Alertas del alumno">
                    <ListaAlertas alertas={suyas} onQuitar={alertas.quitar} />
                </section>
            )}

            <div role="tablist" aria-label="Secciones de la ficha" className="flex flex-wrap gap-2">
                {PESTANAS.map((p) => (
                    <button
                        key={p.id}
                        role="tab"
                        id={`tab-${p.id}`}
                        aria-selected={pestana === p.id}
                        aria-controls={`panel-${p.id}`}
                        className={`min-h-11 cursor-pointer rounded-full px-5 py-2 text-lg ${pestana === p.id ? "bg-acento" : "bg-superficie hover:bg-neutro"}`}
                        onClick={() => setPestana(p.id)}
                    >
                        {p.texto}
                    </button>
                ))}
            </div>
            <section role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`} className="tarjeta bg-superficie-tenue sm:rounded-[52px] sm:p-10">
                {pestana === "resumen" && <ResumenFicha ficha={ficha} alumnoId={alumnoId} onNota={cargar} />}
                {pestana === "perfil" && <PerfilEstadistico alumnoId={alumnoId} />}
                {pestana === "cruce" && <CruceTemas alumnoId={alumnoId} />}
                {pestana === "resultados" && <Resultados alumnoId={alumnoId} />}
                {pestana === "notas" && <Notas alumnoId={alumnoId} />}
            </section>
            <p className="text-sm text-tinta-suave">{AVISO_ESTIMACION}</p>
        </div>
    );
}

function ResumenFicha({ ficha, alumnoId, onNota }: { ficha: Ficha; alumnoId: string; onNota(): void }) {
    const e = ficha.estadoEmocionalReciente;
    const d = ficha.resumenDesempeno;
    const conteo = e.serie.reduce<Record<string, number>>((m, s) => ({ ...m, [s.estado]: (m[s.estado] ?? 0) + 1 }), {});
    return (
        <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-[2rem] bg-white p-6">
                <h2 className="text-xl font-bold">Desempeño</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                    <li className={PILDORA}>Completadas: <strong>{d.completadas}</strong></li>
                    <li className={PILDORA}>En curso: <strong>{d.enCurso}</strong></li>
                    <li className={PILDORA}>Pendientes: <strong>{d.pendientes}</strong></li>
                    <li className={PILDORA}>Resultado promedio: <strong>{d.promedioResultado ?? "—"}</strong> / 10</li>
                    <li className={PILDORA}>Puntos: <strong>{d.puntos}</strong> · nivel {d.nivelGamificacion}</li>
                    <li className={PILDORA}>Racha: <strong>{d.racha.actual}</strong> (mejor {d.racha.mejor})</li>
                    <li className={PILDORA}>Cámara: {ficha.datos.camara ? "autorizada por el tutor" : "sin cámara (solo desempeño)"}</li>
                </ul>
            </div>
            <div className="rounded-[2rem] bg-white p-6">
                <h2 className="text-xl font-bold">Estado socioemocional</h2>
                <p className="mt-2">
                    PANAS-C: AP <strong>{e.afectoPositivo ?? "—"}</strong> · AN <strong>{e.afectoNegativo ?? "—"}</strong>
                </p>
                {e.observaciones.length > 0 && <p className="text-tinta-suave">{e.observaciones.join(" · ")}</p>}
                {e.serie.length > 0 ? (
                    <>
                        <p className="mt-2">Última sesión con cámara ({e.serie.length} muestras):</p>
                        <div className="mt-1 flex h-6 overflow-hidden rounded-full" role="img" aria-label={Object.entries(conteo).map(([k, n]) => `${ESTADO[k]?.texto ?? k}: ${n}`).join(", ")}>
                            {e.serie.map((s, i) => (
                                <span key={i} className={`flex-1 ${s.estado === "frustracion" ? "bg-alerta" : s.estado === "positivo" ? "bg-exito" : s.estado === "neutral" ? "bg-marca" : s.estado === "desinteres" ? "bg-acento" : "bg-slate-200"}`} />
                            ))}
                        </div>
                        <p className="mt-1 text-sm">
                            {Object.entries(conteo).map(([k, n], i) => (
                                <Fragment key={k}>
                                    {i > 0 && " · "}
                                    <IconoEstado estado={k} /> {ESTADO[k]?.texto ?? k} {n}
                                </Fragment>
                            ))}
                        </p>
                    </>
                ) : (
                    <p className="mt-2 text-tinta-suave">Sin muestras de cámara.</p>
                )}
            </div>
            <div className="rounded-[2rem] bg-white p-6 md:col-span-2">
                <h2 className="text-xl font-bold">Últimas notas</h2>
                <NotaRapida alumnoId={alumnoId} onGuardada={onNota} />
                <ListaNotas notas={ficha.ultimasNotas} alumnoId={alumnoId} onCambio={onNota} />
            </div>
        </div>
    );
}

/** EXP-07.5: 3 campos (fecha automática, texto, etiqueta opcional) en ≤ 2 clics. */
function NotaRapida({ alumnoId, onGuardada }: { alumnoId: string; onGuardada(): void }) {
    const [texto, setTexto] = useState("");
    const [etiqueta, setEtiqueta] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    async function guardar(ev: FormEvent) {
        ev.preventDefault();
        if (!texto.trim()) return;
        setEnviando(true);
        setError(null);
        try {
            await api("POST", `/docente/alumnos/${alumnoId}/notas`, { texto: texto.trim(), etiqueta: etiqueta || null });
            setTexto("");
            setEtiqueta("");
            onGuardada();
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se guardó la nota.");
        } finally {
            setEnviando(false);
        }
    }
    return (
        <form onSubmit={guardar} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="min-w-60 flex-grow">
                <span className="etiqueta">Nota rápida</span>
                <input className="campo" value={texto} maxLength={500} onChange={(e) => setTexto(e.target.value)} placeholder="Observación breve…" required />
            </label>
            <label>
                <span className="etiqueta">Etiqueta</span>
                <select className="campo" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
                    {ETIQUETAS.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}
                </select>
            </label>
            <button className="boton" disabled={enviando || !texto.trim()}>Guardar</button>
            {error && <Aviso tipo="error">{error}</Aviso>}
        </form>
    );
}

function ListaNotas({ notas, alumnoId, onCambio }: { notas: Nota[]; alumnoId: string; onCambio(): void }) {
    if (notas.length === 0) return <p className="mt-2 text-tinta-suave">Sin notas.</p>;
    return (
        <ul className="mt-3 flex flex-col gap-2">
            {notas.map((n) => <NotaItem key={n.id} nota={n} alumnoId={alumnoId} onCambio={onCambio} />)}
        </ul>
    );
}

/** Una nota: ver, editar en el lugar o borrar con confirmación. Solo el autor ve las acciones. */
function NotaItem({ nota, alumnoId, onCambio }: { nota: Nota; alumnoId: string; onCambio(): void }) {
    const [modo, setModo] = useState<"ver" | "editar" | "borrar">("ver");
    const [texto, setTexto] = useState(nota.texto);
    const [etiqueta, setEtiqueta] = useState(nota.etiqueta ?? "");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const ruta = `/docente/alumnos/${alumnoId}/notas/${nota.id}`;
    const nombreEtiqueta = nota.etiqueta ? ETIQUETAS.find((x) => x.id === nota.etiqueta)?.texto ?? nota.etiqueta : null;

    function cambiarModo(m: typeof modo) {
        setTexto(nota.texto);
        setEtiqueta(nota.etiqueta ?? "");
        setError(null);
        setModo(m);
    }
    async function enviar(accion: () => Promise<unknown>, mensaje: string) {
        setEnviando(true);
        setError(null);
        try {
            await accion();
            setModo("ver");
            onCambio();
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : mensaje);
        } finally {
            setEnviando(false);
        }
    }
    const guardar = (ev: FormEvent) => {
        ev.preventDefault();
        if (!texto.trim()) return;
        void enviar(() => api("PUT", ruta, { texto: texto.trim(), etiqueta: etiqueta || null }), "No se guardaron los cambios.");
    };
    const borrar = () => void enviar(() => api("DELETE", ruta), "No se borró la nota.");

    if (modo === "editar") {
        return (
            <li className="rounded-xl border-2 border-marca bg-white px-3 py-2">
                <form onSubmit={guardar} className="flex flex-wrap items-end gap-2" aria-label="Editar nota">
                    <label className="min-w-60 flex-grow">
                        <span className="etiqueta">Texto de la nota</span>
                        <input className="campo" value={texto} maxLength={500} onChange={(e) => setTexto(e.target.value)} required autoFocus />
                    </label>
                    <label>
                        <span className="etiqueta">Etiqueta</span>
                        <select className="campo" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
                            {ETIQUETAS.map((x) => <option key={x.id} value={x.id}>{x.texto}</option>)}
                        </select>
                    </label>
                    <button className="boton" disabled={enviando || !texto.trim()}><Check aria-hidden="true" className={ICONO} /> Guardar cambios</button>
                    <button type="button" className="boton-secundario" onClick={() => cambiarModo("ver")} disabled={enviando}>Cancelar</button>
                </form>
                {error && <div className="mt-2"><Aviso tipo="error">{error}</Aviso></div>}
            </li>
        );
    }

    return (
        <li className="rounded-xl bg-fondo px-3 py-2">
            <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-grow">
                    <span className="text-sm text-tinta-suave">{fechaHora(nota.fecha)}{nombreEtiqueta ? ` · ${nombreEtiqueta}` : ""}</span>
                    <p className="break-words">{nota.texto}</p>
                </div>
                {nota.propia && modo === "ver" && (
                    <div className="flex gap-1">
                        <button type="button" className="boton-secundario px-3" onClick={() => cambiarModo("editar")} aria-label={`Editar la nota «${nota.texto.slice(0, 40)}»`}>
                            <Pencil aria-hidden="true" className={ICONO} /> Editar
                        </button>
                        <button type="button" className="boton-secundario px-3" onClick={() => cambiarModo("borrar")} aria-label={`Borrar la nota «${nota.texto.slice(0, 40)}»`}>
                            <Trash2 aria-hidden="true" className={ICONO} /> Borrar
                        </button>
                    </div>
                )}
            </div>
            {modo === "borrar" && (
                <div role="group" aria-label="Confirmar borrado" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-alerta-suave p-2">
                    <p className="flex-grow font-bold text-alerta">¿Borrar esta nota? No se puede deshacer.</p>
                    <button type="button" className="boton" onClick={borrar} disabled={enviando}>Sí, borrar</button>
                    <button type="button" className="boton-secundario" onClick={() => cambiarModo("ver")} disabled={enviando}>Cancelar</button>
                </div>
            )}
            {error && <div className="mt-2"><Aviso tipo="error">{error}</Aviso></div>}
        </li>
    );
}

function Notas({ alumnoId }: { alumnoId: string }) {
    const [notas, setNotas] = useState<Nota[] | null>(null);
    const cargar = useCallback(() => {
        api<{ items: Nota[] }>("GET", `/docente/alumnos/${alumnoId}/notas`).then((r) => setNotas(r.items)).catch(() => setNotas([]));
    }, [alumnoId]);
    useEffect(cargar, [cargar]);
    return (
        <div>
            <h2 className="text-xl font-bold">Notas</h2>
            <NotaRapida alumnoId={alumnoId} onGuardada={cargar} />
            {notas ? <ListaNotas notas={notas} alumnoId={alumnoId} onCambio={cargar} /> : <p role="status">Cargando…</p>}
        </div>
    );
}

function PerfilEstadistico({ alumnoId }: { alumnoId: string }) {
    const [datos, setDatos] = useState<PerfilTema[] | null>(null);
    useEffect(() => {
        api<{ porTema: PerfilTema[] }>("GET", `/docente/alumnos/${alumnoId}/perfil-estadistico`).then((r) => setDatos(r.porTema)).catch(() => setDatos([]));
    }, [alumnoId]);
    if (!datos) return <p role="status">Cargando…</p>;
    if (datos.length === 0) return <p className="text-tinta-suave">Todavía no hay ejercicios resueltos.</p>;
    const menores = datos.flatMap((t) => t.habilidadesMenorDominio.map((h) => ({ ...h, tema: t.tema }))).sort((a, b) => a.porcentajeAciertos - b.porcentajeAciertos).slice(0, 3);
    return (
        <div className="flex flex-col gap-4 overflow-x-auto">
            <h2 className="text-center text-2xl font-bold">Estadísticas</h2>
            <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 text-center">
                <thead>
                    <tr>
                        <th scope="col" className={`${CELDA} bg-marca-claro text-left`}>Tema</th>
                        <th scope="col" className={`${CELDA} bg-marca-claro`}>Ejercicios</th>
                        <th scope="col" className={`${CELDA} bg-marca-claro`}>Tiempo prom.</th>
                        <th scope="col" className={`${CELDA} bg-marca-claro`}>Intentos prom.</th>
                        <th scope="col" className={`${CELDA} bg-marca-claro`}>Índice porcentual</th>
                        <th scope="col" className={`${CELDA} bg-marca-claro`}>Errores por tipo</th>
                    </tr>
                </thead>
                <tbody>
                    {datos.map((t, i) => {
                        const fondo = i % 2 === 0 ? "bg-marca-tenue" : "bg-marca-suave";
                        return (
                            <tr key={t.temaId}>
                                <th scope="row" className={`${CELDA} ${fondo} text-left font-normal`}>{t.tema}</th>
                                <td className={`${CELDA} ${fondo}`}>{t.ejercicios}</td>
                                <td className={`${CELDA} ${fondo}`}>{segundos(t.tiempoPromedioMs)}</td>
                                <td className={`${CELDA} ${fondo}`}>{t.intentosPromedio ?? "—"}</td>
                                <td className={`${CELDA} ${fondo}`}>{t.porcentajeAciertos === null ? "—" : `${t.porcentajeAciertos} %`}</td>
                                <td className={`${CELDA} ${fondo}`}>{Object.entries(t.erroresPorTipo).map(([k, n]) => `${TIPO_ERROR[k] ?? k} ${n}`).join(" · ") || "—"}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <div>
                <h2 className="text-xl font-bold">Habilidades con menor dominio</h2>
                {menores.length ? (
                    <ul className="mt-1 list-disc pl-6">
                        {menores.map((h) => <li key={`${h.tema}-${h.habilidad}`}>{h.tema}: {h.habilidad} — {h.porcentajeAciertos} % de aciertos ({h.intentos} intentos)</li>)}
                    </ul>
                ) : (
                    <p className="text-tinta-suave">Se necesitan al menos 5 intentos por habilidad.</p>
                )}
            </div>
        </div>
    );
}

function CruceTemas({ alumnoId }: { alumnoId: string }) {
    const [datos, setDatos] = useState<Cruce[] | null>(null);
    useEffect(() => {
        api<{ porTema: Cruce[] }>("GET", `/docente/alumnos/${alumnoId}/cruce`).then((r) => setDatos(r.porTema)).catch(() => setDatos([]));
    }, [alumnoId]);
    if (!datos) return <p role="status">Cargando…</p>;
    if (datos.length === 0) return <p className="text-tinta-suave">El cruce aparece cuando el alumno tenga el diagnóstico de matemáticas y el cuestionario PANAS-C de una misma sesión.</p>;
    return (
        <div className="flex flex-col gap-3">
            <p className="text-tinta-suave">
                Por tema: nivel de dominio del diagnóstico de matemáticas frente al afecto positivo (AP) y negativo (AN) del PANAS-C de la misma
                sesión. Se resalta cuando el dominio es 2 o menor y el AN es 3 o mayor.
            </p>
            <ul className="flex flex-col gap-3">
                {datos.map((c) => (
                    <li key={c.temaId} className={`rounded-xl p-3 ${c.coincidencia ? "border-2 border-alerta bg-alerta-suave" : "bg-fondo"}`}>
                        <p className="font-bold">
                            {c.coincidencia && <TriangleAlert aria-hidden="true" className={`${ICONO} mr-1 text-alerta`} />}
                            {c.tema}
                            {c.coincidencia && <span className="ml-2 font-semibold text-alerta">Coincidencia: dominio bajo con afecto negativo alto</span>}
                        </p>
                        <p className="text-sm text-tinta-suave">Última sesión: {fechaCorta(c.ultima.fecha)}</p>
                        <div className="mt-2 grid grid-cols-[11rem_1fr_4rem] items-center gap-2">
                            <span>Dominio (diagnóstico)</span>
                            <Barra valor={c.ultima.nivelDominio} max={5} etiqueta={`Dominio ${c.ultima.nivelDominio} de 5`} />
                            <span className="text-right font-bold">{c.ultima.nivelDominio}/5</span>
                            <span>Afecto positivo</span>
                            <Barra valor={c.ultima.afectoPositivo} max={5} etiqueta={`Afecto positivo ${c.ultima.afectoPositivo} de 5`} />
                            <span className="text-right font-bold">{c.ultima.afectoPositivo}</span>
                            <span>Afecto negativo</span>
                            <Barra valor={c.ultima.afectoNegativo} max={5} etiqueta={`Afecto negativo ${c.ultima.afectoNegativo} de 5`} clase="bg-alerta" />
                            <span className="text-right font-bold">{c.ultima.afectoNegativo}</span>
                        </div>
                        <p className="mt-1 text-sm text-tinta-suave">
                            {c.ultima.porcentajeAciertos} % de aciertos en el diagnóstico · Promedio de {c.sesiones} {c.sesiones === 1 ? "sesión" : "sesiones"}: dominio{" "}
                            {c.dominioPromedio}, AP {c.afectoPositivoProm}, AN {c.afectoNegativoProm}
                        </p>
                        {c.historial.length > 1 && (
                            <table className="mt-2 w-full text-sm">
                                <caption className="sr-only">Sesiones anteriores de {c.tema}</caption>
                                <thead>
                                    <tr className="text-left text-tinta-suave">
                                        <th scope="col">Fecha</th>
                                        <th scope="col">Dominio</th>
                                        <th scope="col">AP</th>
                                        <th scope="col">AN</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {c.historial.map((h) => (
                                        <tr key={h.fecha}>
                                            <td>{fechaCorta(h.fecha)}</td>
                                            <td>{h.nivelDominio}/5</td>
                                            <td>{h.afectoPositivo}</td>
                                            <td>{h.afectoNegativo}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Resultados({ alumnoId }: { alumnoId: string }) {
    const [datos, setDatos] = useState<{ items: Resultado[]; consolidado: Consolidado[] } | null>(null);
    const [temas, setTemas] = useState<{ id: string; nombre: string }[]>([]);
    const [form, setForm] = useState({ temaId: "", tipo: "tarea", titulo: "", calificacion: "", fecha: new Date().toISOString().slice(0, 10) });
    const [error, setError] = useState<string | null>(null);
    const cargar = useCallback(() => {
        api<{ items: Resultado[]; consolidado: Consolidado[] }>("GET", `/docente/alumnos/${alumnoId}/resultados`).then(setDatos).catch(() => setDatos({ items: [], consolidado: [] }));
    }, [alumnoId]);
    useEffect(cargar, [cargar]);
    useEffect(() => {
        api<{ items: { id: string; nombre: string }[] }>("GET", "/catalogo/temas").then((r) => {
            setTemas(r.items);
            setForm((f) => ({ ...f, temaId: f.temaId || r.items[0]?.id || "" }));
        }).catch(() => {});
    }, []);

    async function capturar(ev: FormEvent) {
        ev.preventDefault();
        setError(null);
        try {
            await api("POST", `/docente/alumnos/${alumnoId}/resultados`, { ...form, calificacion: Number(form.calificacion) });
            setForm((f) => ({ ...f, titulo: "", calificacion: "" }));
            cargar();
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se guardó la calificación.");
        }
    }

    const tipos = ["tarea", "trabajo_clase", "interrogacion", "actividad_numotion"];
    return (
        <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold">Consolidado por tema</h2>
            {!datos ? <p role="status">Cargando…</p> : datos.consolidado.length === 0 ? <p className="text-tinta-suave">Sin calificaciones todavía.</p> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-neutro">
                                <th scope="col" className="py-2 pr-3">Tema</th>
                                {tipos.map((t) => <th key={t} scope="col" className="pr-3">{TIPO_RESULTADO[t]}</th>)}
                                <th scope="col">Promedio</th>
                            </tr>
                        </thead>
                        <tbody>
                            {datos.consolidado.map((c) => (
                                <tr key={c.temaId} className="border-b border-white">
                                    <th scope="row" className="py-2 pr-3">{c.tema}</th>
                                    {tipos.map((t) => <td key={t} className="pr-3">{c.porTipo[t] ?? "—"}</td>)}
                                    <td className={`font-bold ${c.promedio < 6 ? "text-alerta" : ""}`}>{c.promedio}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <form onSubmit={capturar} className="grid gap-2 rounded-xl bg-fondo p-3 sm:grid-cols-6">
                <h3 className="font-bold sm:col-span-6">Capturar calificación</h3>
                <label className="sm:col-span-2"><span className="etiqueta">Tema</span>
                    <select className="campo" value={form.temaId} onChange={(e) => setForm({ ...form, temaId: e.target.value })} required>
                        {temas.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                </label>
                <label className="sm:col-span-2"><span className="etiqueta">Tipo</span>
                    <select className="campo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                        {tipos.slice(0, 3).map((t) => <option key={t} value={t}>{TIPO_RESULTADO[t]}</option>)}
                    </select>
                </label>
                <label className="sm:col-span-2"><span className="etiqueta">Fecha</span>
                    <input type="date" className="campo" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
                </label>
                <label className="sm:col-span-4"><span className="etiqueta">Título</span>
                    <input className="campo" value={form.titulo} maxLength={120} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
                </label>
                <label className="sm:col-span-1"><span className="etiqueta">Calificación (0–10)</span>
                    <input type="number" min={0} max={10} step={0.1} className="campo" value={form.calificacion} onChange={(e) => setForm({ ...form, calificacion: e.target.value })} required />
                </label>
                <div className="flex items-end sm:col-span-1"><button className="boton w-full">Guardar</button></div>
                {error && <div className="sm:col-span-6"><Aviso tipo="error">{error}</Aviso></div>}
            </form>
            {datos && datos.items.length > 0 && (
                <details>
                    <summary className="cursor-pointer font-bold">Registros ({datos.items.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                        {datos.items.map((r) => <li key={r.id}>{fechaCorta(r.fecha)} · {r.tema} · {TIPO_RESULTADO[r.tipo] ?? r.tipo} · {r.titulo}: <strong>{r.calificacion}</strong></li>)}
                    </ul>
                </details>
            )}
        </div>
    );
}
