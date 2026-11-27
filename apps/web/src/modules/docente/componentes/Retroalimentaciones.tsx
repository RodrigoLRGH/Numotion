// D7 · Retroalimentaciones de diagnóstico (RF-61, RF-62): registros por alumno y fecha del grupo y
// detalle de cada uno (diagnóstico matemático por tema + PANAS-C del día). Sustituye al "Detalle
// por alumno" del Dashboard. Lo emocional se muestra una sola vez: el PANAS-C es del día, no por tema.
import { UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { Ayuda } from "../../../shared/ui/Ayuda";
import { Dialogo } from "../../../shared/ui/Dialogo";
import { AVISO_ESTIMACION, AYUDA_AN, AYUDA_AP, EtiquetaEstado } from "./estados";

interface Grupo {
    id: string;
    nombre: string;
    grado: number;
}
interface Registro {
    id: string;
    fecha: string;
    alumno: { id: string; nombre: string };
    estadoInicial: string;
}
interface TemaRetro {
    temaId: string;
    tema: string;
    ejercicios: number;
    aciertos: number;
    errores: number;
    nivelDominio: number;
}
interface Detalle {
    id: string;
    fecha: string;
    alumno: { id: string; nombre: string; grupo: string };
    estadoInicial: string;
    afectoPositivo: number | null;
    afectoNegativo: number | null;
    descripcion: string[];
    temas: TemaRetro[];
}

/** DD/MM/AAAA (Figma) */
export const fechaNumerica = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

// El Dashboard recuerda el último grupo elegido con la misma clave
const CLAVE_GRUPO = "numotion.docente.grupo";
const leerGrupo = () => {
    try {
        return localStorage.getItem(CLAVE_GRUPO);
    } catch {
        return null;
    }
};

function Encabezado() {
    return (
        <header className="text-center">
            <h1 className="titulo-pagina">Retroalimentación de diagnósticos</h1>
            <p className="mt-1 text-2xl font-bold">Diagnóstico Matemático y Cuestionario Socioemocional</p>
        </header>
    );
}

// ───────────── ¿Qué es…? ─────────────

const QUE_ES_MATEMATICO = (
    <>
        <p>Al iniciar el día, cada alumno resuelve de 3 a 5 preguntas por tema. Empieza en el nivel 2: si acierta, la siguiente pregunta es más difícil; si falla, más fácil.</p>
        <p>El <strong>nivel de dominio</strong> (del 1 al 5) es el nivel más alto que acertó sin fallar el anterior. Con él se elige el nivel inicial de las actividades que le asignes.</p>
        <p>Si el alumno hizo el diagnóstico hace poco, contesta una versión corta: una pregunta por tema en su último nivel.</p>
    </>
);

const QUE_ES_EMOCIONAL = (
    <>
        <p>
            Es el <strong>PANAS-C</strong>: un cuestionario psicológico de autoinforme diseñado para medir la frecuencia con la que niños y adolescentes
            experimentan emociones positivas y negativas.
        </p>
        <p>El alumno contesta 10 preguntas cortas con una escala del 1 (nada) al 5 (muchísimo). Se obtienen dos promedios: <strong>afecto positivo (AP)</strong> y <strong>afecto negativo (AN)</strong>.</p>
        <p>Con ellos se estima cómo llega a la clase: frustración si AN es 3.0 o más; positivo si AP es 3.5 o más y AN menor a 2.5; desinterés si AP es menor a 2.5; neutral en otro caso.</p>
        <p className="text-base text-tinta-suave">Es una estimación de apoyo, no un diagnóstico clínico. El alumno nunca ve sus puntajes.</p>
    </>
);

function EnlacesQueEs() {
    const [abierto, setAbierto] = useState<"matematico" | "emocional" | null>(null);
    const cerrar = useCallback(() => setAbierto(null), []);
    return (
        <>
            <div className="flex flex-wrap justify-center gap-x-16 gap-y-3">
                <button type="button" className="cursor-pointer text-lg font-bold underline underline-offset-4" onClick={() => setAbierto("matematico")}>
                    ¿Qué es el diagnóstico matemático?
                </button>
                <button type="button" className="cursor-pointer text-lg font-bold underline underline-offset-4" onClick={() => setAbierto("emocional")}>
                    ¿Qué es el cuestionario socioemocional?
                </button>
            </div>
            <Dialogo titulo="¿Qué es el diagnóstico matemático?" abierto={abierto === "matematico"} onCerrar={cerrar}>{QUE_ES_MATEMATICO}</Dialogo>
            <Dialogo titulo="¿Qué es el cuestionario socioemocional?" abierto={abierto === "emocional"} onCerrar={cerrar}>{QUE_ES_EMOCIONAL}</Dialogo>
        </>
    );
}

// ───────────── Registros ─────────────

export function ListaRetroalimentaciones() {
    const [grupos, setGrupos] = useState<Grupo[] | null>(null);
    const [grupoId, setGrupoId] = useState("");
    const [items, setItems] = useState<Registro[] | null>(null);
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
        setItems(null);
        api<{ items: Registro[] }>("GET", `/docente/grupos/${grupoId}/retroalimentaciones`)
            .then((r) => {
                setItems(r.items);
                setError(null);
            })
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar las retroalimentaciones."));
    }, [grupoId]);

    const sinGrupos = grupos !== null && grupos.length === 0;
    // Figma: sin diagnósticos la pantalla solo muestra el aviso
    if (sinGrupos || (items && items.length === 0 && grupos?.length === 1)) {
        return (
            <section aria-labelledby="sin-retro" className="flex flex-col items-center gap-16 py-10 text-center">
                <h1 id="sin-retro" className="titulo-pagina">Retroalimentación</h1>
                <p className="text-2xl">No se han realizado exámenes diagnósticos.</p>
                {sinGrupos && <Link to="/docente/grupos" className="boton">Crear un grupo</Link>}
            </section>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            <Encabezado />
            <EnlacesQueEs />
            {grupos && grupos.length > 1 && (
                <label className="flex min-h-11 items-center gap-3 self-end rounded-2xl bg-superficie py-1.5 pr-2 pl-4 text-lg">
                    Grupo:
                    <select className="min-w-56 cursor-pointer rounded-xl bg-white px-3 py-1 text-base" value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                        {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre} · {g.grado}.º</option>)}
                    </select>
                </label>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!items && !error && <p role="status">Cargando…</p>}
            {items && (
                <section aria-labelledby="registros">
                    <h2 id="registros" className="mb-3 text-lg font-bold">Registros:</h2>
                    {items.length === 0 ? (
                        <p className="tarjeta text-tinta-suave">No se han realizado exámenes diagnósticos en este grupo.</p>
                    ) : (
                        <ul className="flex flex-col gap-4">
                            {items.map((r) => (
                                <li key={r.id}>
                                    <Link
                                        to={`/docente/retroalimentaciones/${r.id}`}
                                        className="flex min-h-14 flex-wrap items-center gap-3 bg-superficie px-4 py-3 text-lg hover:bg-neutro"
                                    >
                                        <UserRound aria-hidden="true" className="size-6 shrink-0 fill-tinta-suave text-tinta-suave" />
                                        <span className="flex-grow">{r.alumno.nombre}</span>
                                        <span className="sm:w-56">Fecha: {fechaNumerica(r.fecha)}</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}

// ───────────── Detalle ─────────────

const PILDORA = "flex min-h-12 items-center justify-center rounded-full px-4 py-2";
const ENCABEZADO = `${PILDORA} bg-marca-claro font-bold`;
const AYUDA_PANAS = (
    <>
        Métrica emocional del examen diagnóstico <strong>PANAS-C</strong>: cuestionario psicológico de autoinforme diseñado para medir la{" "}
        <strong>frecuencia</strong> con la que niños y adolescentes <strong>experimentan emociones positivas y negativas</strong>.
    </>
);

export function DetalleRetroalimentacion({ id }: { id: string }) {
    const [d, setD] = useState<Detalle | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<Detalle>("GET", `/docente/retroalimentaciones/${id}`)
            .then(setD)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudo cargar la retroalimentación."));
    }, [id]);

    return (
        <div className="flex flex-col gap-8">
            <Encabezado />
            <Link to="/docente/retroalimentaciones" className="enlace self-start">← Volver a los registros</Link>
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!d && !error && <p role="status">Cargando…</p>}
            {d && (
                <>
                    <div className="flex flex-wrap items-baseline justify-between gap-4 text-lg">
                        <p><span className="font-bold">Nombre del alumno:</span> {d.alumno.nombre} <span className="text-tinta-suave">· {d.alumno.grupo}</span></p>
                        <p><span className="font-bold">Fecha:</span> {fechaNumerica(d.fecha)}</p>
                    </div>

                    {/* Lo emocional (PANAS-C del día) va una sola vez, fuera de la tabla por tema */}
                    <section aria-labelledby="emocional" className="flex flex-wrap items-center gap-x-6 gap-y-3 text-lg">
                        <h2 id="emocional" className="font-bold">
                            <Ayuda etiqueta="Cuestionario socioemocional: qué mide" texto={AYUDA_PANAS}>Cuestionario socioemocional (PANAS-C)</Ayuda>:
                        </h2>
                        <EtiquetaEstado estado={d.estadoInicial} />
                        <span><Ayuda etiqueta="AP: qué significa" texto={AYUDA_AP}>AP</Ayuda> <strong>{d.afectoPositivo?.toFixed(1) ?? "—"}</strong></span>
                        <span><Ayuda etiqueta="AN: qué significa" texto={AYUDA_AN}>AN</Ayuda> <strong>{d.afectoNegativo?.toFixed(1) ?? "—"}</strong></span>
                    </section>

                    <section aria-labelledby="descripcion">
                        <h2 id="descripcion" className="mb-3 text-lg font-bold">Descripción:</h2>
                        <div className="mx-auto flex max-w-5xl flex-col gap-3 rounded-[3rem] bg-superficie-tenue px-6 py-8 text-lg sm:px-16">
                            {d.descripcion.map((p) => <p key={p}>{p}</p>)}
                        </div>
                    </section>

                    {d.temas.length > 0 && (
                        <section className="overflow-x-auto" aria-label="Diagnóstico matemático por tema">
                            <table className="w-full border-separate border-spacing-x-4 border-spacing-y-3 text-center text-lg">
                                <thead className="text-base">
                                    <tr>
                                        <th scope="col" className="min-w-56"><div className={`${ENCABEZADO} text-lg`}>Tema/Subtema</div></th>
                                        <th scope="col"><div className={ENCABEZADO}>No. Ejercicios</div></th>
                                        <th scope="col"><div className={ENCABEZADO}>No. Aciertos</div></th>
                                        <th scope="col"><div className={ENCABEZADO}>No. Errores</div></th>
                                        <th scope="col"><div className={ENCABEZADO}>Nivel de dominio</div></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {d.temas.map((t, i) => {
                                        const celda = `${PILDORA} ${i % 2 === 0 ? "bg-marca-tenue" : "bg-marca-suave"}`;
                                        return (
                                            <tr key={t.temaId}>
                                                <th scope="row" className="font-normal"><div className={celda}>{t.tema}</div></th>
                                                <td><div className={celda}>{t.ejercicios}</div></td>
                                                <td><div className={celda}>{t.aciertos}</div></td>
                                                <td><div className={celda}>{t.errores}</div></td>
                                                <td><div className={celda}>{t.nivelDominio} de 5</div></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </section>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-tinta-suave">{AVISO_ESTIMACION}</p>
                        <Link to={`/docente/alumnos/${d.alumno.id}`} className="boton-secundario">Ver ficha del alumno</Link>
                    </div>
                </>
            )}
        </div>
    );
}
