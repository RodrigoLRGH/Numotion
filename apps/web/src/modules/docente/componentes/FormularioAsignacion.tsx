// D2 · Nueva actividad (RF-56, RF-57, EXP-03.1–03.3): asistente de 3 pasos.
// El destino es excluyente por diseño: el radio elige qué se envía (grupo O alumnos).
import { useEffect, useMemo, useState } from "react";
import { AVATARES } from "@numotion/core/dominio/acceso";
import { nombreTipo } from "@numotion/core/dominio/catalogo";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";

interface Tema {
    id: string;
    clave: string;
    nombre: string;
    gradoMin: number;
    gradoMax: number;
    tiposInteraccion: string[];
}
interface Grupo {
    id: string;
    nombre: string;
    grado: number;
}
interface Alumno {
    id: string;
    nombre: string;
    apellidos: string;
    avatar: string;
    activo: boolean;
}
interface Nivel {
    alumnoId: string;
    nombre: string;
    avatar: string;
    nivelInicial: number;
    sinDiagnostico: boolean;
    estadoInicial: string | null;
}

const PASOS = ["Datos", "Destinatarios", "Confirmar"] as const;

export const hoyLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Tijuana" });
const emoji = (id: string) => AVATARES.find((a) => a.id === id)?.emoji ?? "🙂";

function motivoNivel(n: Nivel): string {
    if (n.sinDiagnostico) return "sin diagnóstico reciente: nivel por defecto";
    if (n.estadoInicial === "frustracion") return "bajó 1 por frustración al inicio del día";
    return "según su diagnóstico";
}

export default function FormularioAsignacion() {
    const [paso, setPaso] = useState(0);
    const [temas, setTemas] = useState<Tema[]>([]);
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [datos, setDatos] = useState({ nombre: "", temaId: "", tipoInteraccion: "", fechaAsignacion: hoyLocal(), numEjercicios: 10 });
    const [modo, setModo] = useState<"grupo" | "alumnos">("grupo");
    const [grupoId, setGrupoId] = useState("");
    const [alumnos, setAlumnos] = useState<Alumno[]>([]);
    const [elegidos, setElegidos] = useState<Set<string>>(new Set());
    const [niveles, setNiveles] = useState<Nivel[] | null>(null);
    const [creada, setCreada] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        Promise.all([api<{ items: Tema[] }>("GET", "/catalogo/temas"), api<{ items: Grupo[] }>("GET", "/docente/grupos")])
            .then(([t, g]) => {
                setTemas(t.items);
                setGrupos(g.items);
                setGrupoId((actual) => actual || g.items[0]?.id || "");
            })
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar los datos."));
    }, []);

    useEffect(() => {
        if (!grupoId) return;
        setElegidos(new Set());
        api<{ items: Alumno[] }>("GET", `/docente/grupos/${grupoId}/alumnos`)
            .then((r) => setAlumnos(r.items.filter((a) => a.activo)))
            .catch(() => setAlumnos([]));
    }, [grupoId]);

    const grupo = grupos.find((g) => g.id === grupoId);
    // Temas del grado del grupo elegido (si aún no hay grupo, todos)
    // Solo temas del grado del grupo que ya tienen ejercicios disponibles
    const temasDelGrado = useMemo(
        () => temas.filter((t) => t.tiposInteraccion.length > 0 && (!grupo || (grupo.grado >= t.gradoMin && grupo.grado <= t.gradoMax))),
        [temas, grupo],
    );
    const tema = temas.find((t) => t.id === datos.temaId);
    const destino = modo === "grupo" ? { tipo: "grupo" as const, grupoId } : { tipo: "alumnos" as const, alumnoIds: [...elegidos] };

    const paso1Valido = datos.nombre.trim() && tema && tema.tiposInteraccion.includes(datos.tipoInteraccion) && datos.numEjercicios >= 3 && datos.numEjercicios <= 30;
    const paso2Valido = modo === "grupo" ? Boolean(grupoId) : elegidos.size > 0;

    async function irAConfirmar() {
        setOcupado(true);
        setError(null);
        try {
            const q = modo === "grupo" ? `grupoId=${grupoId}` : `alumnoIds=${[...elegidos].join(",")}`;
            const r = await api<{ items: Nivel[] }>("GET", `/docente/actividades/previsualizar-niveles?temaId=${datos.temaId}&${q}`);
            setNiveles(r.items);
            setPaso(2);
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se pudo calcular el nivel inicial.");
        } finally {
            setOcupado(false);
        }
    }

    async function asignar() {
        setOcupado(true);
        setError(null);
        try {
            const r = await api<{ asignaciones: unknown[] }>("POST", "/docente/actividades", { ...datos, nombre: datos.nombre.trim(), destino });
            setCreada(r.asignaciones.length);
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se pudo asignar.");
        } finally {
            setOcupado(false);
        }
    }

    if (creada !== null) {
        return (
            <section className="tarjeta" aria-labelledby="listo">
                <h1 id="listo" className="text-2xl font-extrabold">Actividad asignada</h1>
                <Aviso tipo="exito">«{datos.nombre}» se asignó a {creada} {creada === 1 ? "alumno" : "alumnos"}.</Aviso>
                <div className="mt-4 flex flex-wrap gap-3">
                    <a href="/docente/actividades" className="boton">Ver actividades asignadas</a>
                    <a href="/docente/actividades/nueva" className="boton-secundario">Asignar otra</a>
                </div>
            </section>
        );
    }

    return (
        <section className="tarjeta" aria-labelledby="titulo">
            <h1 id="titulo" className="mb-4 text-2xl font-extrabold">Nueva actividad</h1>
            <ol className="mb-6 flex flex-wrap gap-2" aria-label="Pasos">
                {PASOS.map((p, i) => (
                    <li key={p} aria-current={i === paso ? "step" : undefined}
                        className={`rounded-full px-3 py-1 text-sm font-bold ${i === paso ? "bg-marca text-white" : i < paso ? "bg-marca-suave text-marca-fuerte" : "bg-slate-100 text-tinta-suave"}`}>
                        {i + 1}. {p}
                    </li>
                ))}
            </ol>

            {paso === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label htmlFor="nombre" className="etiqueta">Nombre</label>
                        <input id="nombre" value={datos.nombre} maxLength={120} placeholder="Sumas 1" className="campo"
                            onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
                    </div>
                    <div>
                        <label htmlFor="tema" className="etiqueta">Tema</label>
                        <select id="tema" value={datos.temaId} className="campo"
                            onChange={(e) => {
                                const t = temas.find((x) => x.id === e.target.value);
                                setDatos({ ...datos, temaId: e.target.value, tipoInteraccion: t?.tiposInteraccion[0] ?? "" });
                            }}>
                            <option value="" disabled>Elige un tema…</option>
                            {temasDelGrado.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="tipo" className="etiqueta">Tipo de ejercicio</label>
                        <select id="tipo" value={datos.tipoInteraccion} disabled={!tema} className="campo"
                            onChange={(e) => setDatos({ ...datos, tipoInteraccion: e.target.value })}>
                            {(tema?.tiposInteraccion ?? []).map((t) => <option key={t} value={t}>{nombreTipo(t)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="fecha" className="etiqueta">Fecha</label>
                        <input id="fecha" type="date" value={datos.fechaAsignacion} className="campo"
                            onChange={(e) => setDatos({ ...datos, fechaAsignacion: e.target.value })} />
                    </div>
                    <div>
                        <label htmlFor="num" className="etiqueta">Número de ejercicios</label>
                        <input id="num" type="number" min={3} max={30} value={datos.numEjercicios} className="campo"
                            onChange={(e) => setDatos({ ...datos, numEjercicios: Number(e.target.value) })} />
                    </div>
                </div>
            )}

            {paso === 1 && (
                <fieldset className="flex flex-col gap-4">
                    <legend className="sr-only">¿A quién se asigna?</legend>
                    <div>
                        <label htmlFor="grupo" className="etiqueta">Grupo</label>
                        <select id="grupo" value={grupoId} className="campo sm:w-64" onChange={(e) => setGrupoId(e.target.value)}>
                            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre} · {g.grado}.º</option>)}
                        </select>
                    </div>
                    <label className="flex items-center gap-2 font-bold">
                        <input type="radio" name="modo" checked={modo === "grupo"} onChange={() => setModo("grupo")} className="size-5" />
                        Todo el grupo ({alumnos.length} alumnos)
                    </label>
                    <label className="flex items-center gap-2 font-bold">
                        <input type="radio" name="modo" checked={modo === "alumnos"} onChange={() => setModo("alumnos")} className="size-5" />
                        Alumnos específicos
                    </label>
                    {modo === "alumnos" && (
                        <ul className="grid gap-2 sm:grid-cols-3" aria-label="Alumnos">
                            {alumnos.map((a) => (
                                <li key={a.id}>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-200 p-2 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                                        <input type="checkbox" className="size-5" checked={elegidos.has(a.id)}
                                            onChange={(e) => {
                                                const s = new Set(elegidos);
                                                if (e.target.checked) s.add(a.id);
                                                else s.delete(a.id);
                                                setElegidos(s);
                                            }} />
                                        <span aria-hidden="true">{emoji(a.avatar)}</span> {a.nombre} {a.apellidos}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-sm text-tinta-suave">Los alumnos que se unan al grupo después no recibirán esta actividad automáticamente.</p>
                </fieldset>
            )}

            {paso === 2 && niveles && (
                <div>
                    <p className="mb-3">
                        <strong>{datos.nombre}</strong> · {tema?.nombre} · {nombreTipo(datos.tipoInteraccion)} · {datos.numEjercicios} ejercicios · {new Date(`${datos.fechaAsignacion}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                    <table className="w-full text-left">
                        <caption className="mb-2 text-left font-bold">Nivel inicial de cada alumno</caption>
                        <thead>
                            <tr className="border-b border-slate-200 text-sm text-tinta-suave">
                                <th scope="col" className="py-2">Alumno</th>
                                <th scope="col" className="py-2">Nivel inicial</th>
                                <th scope="col" className="py-2">Por qué</th>
                            </tr>
                        </thead>
                        <tbody>
                            {niveles.map((n) => (
                                <tr key={n.alumnoId} className="border-b border-slate-100">
                                    <td className="py-2"><span aria-hidden="true" className="mr-2">{emoji(n.avatar)}</span>{n.nombre}</td>
                                    <td className="py-2 text-lg font-bold">{n.nivelInicial}</td>
                                    <td className="py-2 text-sm text-tinta-suave">{motivoNivel(n)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {error && <div className="mt-4"><Aviso tipo="error">{error}</Aviso></div>}

            <div className="mt-6 flex flex-wrap gap-3">
                {paso > 0 && <button type="button" className="boton-secundario" onClick={() => setPaso(paso - 1)} disabled={ocupado}><span aria-hidden="true">←</span> Atrás</button>}
                {paso === 0 && <button type="button" className="boton" onClick={() => setPaso(1)} disabled={!paso1Valido}>Siguiente <span aria-hidden="true">→</span></button>}
                {paso === 1 && <button type="button" className="boton" onClick={irAConfirmar} disabled={!paso2Valido || ocupado}>Revisar niveles <span aria-hidden="true">→</span></button>}
                {paso === 2 && <button type="button" className="boton" onClick={asignar} disabled={ocupado}>Asignar <span aria-hidden="true">✓</span></button>}
            </div>
        </section>
    );
}
