// D1 · Panel docente: resumen previo del grupo (RF-14, RF-62).
// Para el grupo elegido: cuántos alumnos ya hicieron el diagnóstico hoy, distribución del estado
// inicial, AP/AN y dominio promedio; por alumno, su último dato ("sin datos hoy" con la fecha, A-09).
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { AVISO_ESTIMACION, ESTADO, fechaCorta, IconoEstado } from "./estados";

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

export default function PanelDocente() {
    const [grupos, setGrupos] = useState<Grupo[] | null>(null);
    const [grupoId, setGrupoId] = useState<string>("");
    const [alumnoId, setAlumnoId] = useState("");
    const [resumen, setResumen] = useState<Resumen | null>(null);
    const [error, setError] = useState<string | null>(null);

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
        setAlumnoId(""); // el alumno elegido pertenece al grupo anterior
        api<Resumen>("GET", `/docente/grupos/${grupoId}/resumen`)
            .then(setResumen)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudo cargar el resumen."));
    }, [grupoId]);

    const [busqueda, setBusqueda] = useState("");
    const visibles = resumen ? filtrar(resumen.alumnos, busqueda, alumnoId) : [];

    return (
        <div className="flex flex-col gap-8">
            <h1 className="titulo-pagina">Resumen</h1>

            {/* Filtros en píldora (Figma: Buscar alumno · Grupo · Alumno) */}
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex min-h-11 flex-grow items-center gap-2 rounded-full bg-superficie px-4 sm:max-w-xs">
                    <Search aria-hidden="true" className="size-5 shrink-0 text-tinta-suave" />
                    <span className="sr-only">Buscar alumno</span>
                    <input
                        type="search"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar alumno"
                        className="w-full bg-transparent py-2 placeholder:text-tinta-suave focus:outline-none"
                    />
                </label>
                {grupos && grupos.length > 0 && (
                    <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-superficie py-1.5 pr-2 pl-4 text-lg sm:ml-auto">
                        Grupo:
                        <select className="min-w-56 cursor-pointer rounded-xl bg-white px-3 py-1 text-base" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                            {grupos.map((g) => (
                                <option key={g.id} value={g.id}>{g.nombre} · {g.grado}.º</option>
                            ))}
                        </select>
                    </label>
                )}
                {resumen && resumen.alumnos.length > 0 && (
                    <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-superficie py-1.5 pr-2 pl-4 text-lg">
                        Alumno:
                        <select className="min-w-56 cursor-pointer rounded-xl bg-white px-3 py-1 text-base" value={alumnoId} onChange={(e) => setAlumnoId(e.target.value)}>
                            <option value="">Todos</option>
                            {resumen.alumnos.map((a) => (
                                <option key={a.alumnoId} value={a.alumnoId}>{a.nombre}</option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            {error && <Aviso tipo="error">{error}</Aviso>}
            {grupos && grupos.length === 0 && (
                <section className="tarjeta">
                    <p>Aún no tienes grupos.</p>
                    <Link to="/docente/grupos" className="boton mt-3">Crear un grupo</Link>
                </section>
            )}

            {resumen && (
                <div className="grid gap-8 lg:grid-cols-2">
                    <ListaEstados r={resumen} alumnos={visibles} />
                    <ResumenPrevio r={resumen} />
                </div>
            )}

            <p className="text-sm text-tinta-suave">{AVISO_ESTIMACION}</p>
        </div>
    );
}

/** Aplica el alumno elegido en el desplegable y el texto del buscador (se combinan). */
const filtrar = (alumnos: AlumnoResumen[], busqueda: string, alumnoId: string) => {
    const q = busqueda.trim().toLocaleLowerCase("es-MX");
    return alumnos.filter((a) => (!alumnoId || a.alumnoId === alumnoId) && (!q || a.nombre.toLocaleLowerCase("es-MX").includes(q)));
};

const ESTADOS_FILA = ["positivo", "neutral", "frustracion", "desinteres"] as const;
const COLOR_ESTADO: Record<string, string> = {
    positivo: "var(--color-grafica-positivo)",
    neutral: "var(--color-grafica-neutral)",
    frustracion: "var(--color-grafica-frustracion)",
    desinteres: "var(--color-grafica-desinteres)",
    sin_dato: "var(--color-grafica-sin-dato)",
};

/** Panel izquierdo de Figma: nombre del alumno y fila de caritas con el estado inicial resaltado. */
function ListaEstados({ r, alumnos }: { r: Resumen; alumnos: AlumnoResumen[] }) {
    return (
        <section aria-labelledby="titulo-estados" className="tarjeta bg-superficie-tenue sm:rounded-[52px] sm:p-10">
            <h2 id="titulo-estados" className="grid grid-cols-[minmax(8rem,1fr)_auto] gap-4 text-2xl font-bold">
                <span>Alumnos</span>
                <span>Estado socioemocional</span>
            </h2>
            {alumnos.length === 0 ? (
                <p className="mt-4 text-tinta-suave">{r.alumnos.length === 0 ? "Este grupo no tiene alumnos activos." : "Ningún alumno coincide con la búsqueda."}</p>
            ) : (
                <ul className="mt-4 flex flex-col gap-3">
                    {alumnos.map((a) => {
                        const actual = a.sinDatosHoy ? "sin_dato" : (a.estadoInicial ?? "sin_dato");
                        return (
                            <li key={a.alumnoId} className="grid grid-cols-[minmax(8rem,1fr)_auto] items-center gap-4">
                                <Link to={`/docente/alumnos/${a.alumnoId}`} className="truncate hover:underline">{a.nombre}</Link>
                                <span className="flex items-center gap-2">
                                    {ESTADOS_FILA.map((k) => {
                                        const Icono = ESTADO[k].icono;
                                        const activo = k === actual;
                                        return (
                                            <span
                                                key={k}
                                                aria-hidden="true"
                                                className={`flex size-8 items-center justify-center rounded-full ${activo ? "text-white" : "text-slate-400"}`}
                                                style={activo ? { background: COLOR_ESTADO[k] } : undefined}
                                            >
                                                <Icono className="size-5" />
                                            </span>
                                        );
                                    })}
                                    <span className="w-28 text-sm text-tinta-suave">{actual === "sin_dato" ? "Sin datos hoy" : ESTADO[actual]?.texto}</span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

/** Pastel SVG con separación blanca de 2 px entre porciones; cada porción tiene su título como tooltip. */
function Pastel({ datos, total }: { datos: { k: string; n: number; texto: string }[]; total: number }) {
    const R = 100;
    let angulo = -Math.PI / 2;
    const conValor = datos.filter((d) => d.n > 0);
    return (
        <svg viewBox="-104 -104 208 208" className="mx-auto size-56 shrink-0 sm:size-64" role="img" aria-label="Distribución del estado inicial del grupo; los valores están en la leyenda">
            {conValor.length === 1 ? (
                <circle r={R} fill={COLOR_ESTADO[conValor[0].k]}>
                    <title>{`${conValor[0].texto}: ${conValor[0].n} de ${total}`}</title>
                </circle>
            ) : (
                conValor.map((d) => {
                    const delta = (d.n / total) * Math.PI * 2;
                    const x1 = R * Math.cos(angulo);
                    const y1 = R * Math.sin(angulo);
                    angulo += delta;
                    const x2 = R * Math.cos(angulo);
                    const y2 = R * Math.sin(angulo);
                    return (
                        <path
                            key={d.k}
                            d={`M0 0 L${x1} ${y1} A${R} ${R} 0 ${delta > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`}
                            fill={COLOR_ESTADO[d.k]}
                            stroke="white"
                            strokeWidth={2}
                            strokeLinejoin="round"
                            className="transition-opacity hover:opacity-80"
                        >
                            <title>{`${d.texto}: ${d.n} de ${total} (${Math.round((d.n / total) * 100)}%)`}</title>
                        </path>
                    );
                })
            )}
        </svg>
    );
}

function ResumenPrevio({ r }: { r: Resumen }) {
    const g = r.grupo;
    const filas = [
        ...ESTADOS_FILA.map((k) => ({ k: k as string, n: g.distribucion[k] ?? 0, texto: ESTADO[k].texto })),
        { k: "sin_dato", n: g.distribucion.sinDatos ?? 0, texto: "Sin datos hoy" },
    ];
    const total = filas.reduce((suma, f) => suma + f.n, 0);
    return (
        <section aria-labelledby="como-llega" className="tarjeta bg-superficie-tenue sm:rounded-[52px] sm:p-10">
            <h2 id="como-llega" className="text-center text-2xl font-bold">Gráfica global</h2>
            <p className="mt-2 font-bold">
                Fecha de la sesión: <span className="font-normal">{fechaCorta(r.fecha)}</span>
                <span className="font-normal text-tinta-suave"> · {g.conDiagnosticoHoy} de {g.total} con diagnóstico</span>
            </p>
            {total === 0 ? (
                <p className="mt-6 text-tinta-suave">Aún no hay datos para graficar.</p>
            ) : (
                <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
                    <Pastel datos={filas} total={total} />
                    {/* Leyenda = vista de tabla: color + ícono + texto + conteo + porcentaje */}
                    <ul className="flex w-full flex-col gap-2">
                        {filas.map(({ k, n, texto }) => (
                            <li key={k} className="flex items-center gap-2">
                                <span aria-hidden="true" className="size-3.5 shrink-0 rounded-sm" style={{ background: COLOR_ESTADO[k] }} />
                                <IconoEstado estado={k} />
                                <span className="flex-grow">{texto}</span>
                                <span className="text-right font-bold whitespace-nowrap tabular-nums">{n} · {Math.round((n / total) * 100)}%</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
