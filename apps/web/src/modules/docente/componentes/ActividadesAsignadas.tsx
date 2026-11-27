// D3 · Actividades asignadas (RF-58, EXP-03.4): resumen por estado y detalle por alumno.
// Se refresca cada 30 s mientras la pestaña está visible.
import { ArrowRight, Check, Circle, NotebookText, Play, Plus, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AVATARES } from "@numotion/core/dominio/acceso";
import { nombreTipo } from "@numotion/core/dominio/catalogo";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { ICONO } from "./estados";

interface AlumnoEnActividad {
    alumnoId: string;
    nombre: string;
    avatar: string;
    estado: "pendiente" | "en_curso" | "completada";
    nivelInicial: number;
    nivelActual: number;
    resueltos: number;
    resultadoFinal: string | null;
}
interface Actividad {
    actividadId: string;
    nombre: string;
    tema: string;
    tipoInteraccion: string;
    fechaAsignacion: string;
    numEjercicios: number;
    grupo: string | null;
    resumen: { pendiente: number; enCurso: number; completada: number };
    alumnos: AlumnoEnActividad[];
}
interface Pagina {
    items: Actividad[];
    nextCursor: string | null;
}

export const REFRESCO_MS = 30_000;

const ESTADO: Record<AlumnoEnActividad["estado"], [LucideIcon, string, string]> = {
    pendiente: [Circle, "Pendiente", "bg-slate-100 text-tinta"],
    en_curso: [Play, "En curso", "bg-acento-suave text-tinta"],
    completada: [Check, "Completada", "bg-exito-suave text-exito"],
};

const emoji = (id: string) => AVATARES.find((a) => a.id === id)?.emoji ?? "🙂";
// Figma muestra "Fecha de Asignación: DD/MM/AAAA"
const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function ActividadesAsignadas() {
    const [estado, setEstado] = useState<"activas" | "todas">("activas");
    const [pagina, setPagina] = useState<Pagina | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [actualizado, setActualizado] = useState<Date | null>(null);

    const cargar = useCallback(async (cursor?: string) => {
        try {
            const r = await api<Pagina>("GET", `/docente/actividades?estado=${estado}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
            setPagina((p) => (cursor && p ? { items: [...p.items, ...r.items], nextCursor: r.nextCursor } : r));
            setActualizado(new Date());
            setError(null);
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar las actividades.");
        }
    }, [estado]);

    useEffect(() => {
        setPagina(null);
        void cargar();
        const id = setInterval(() => {
            if (document.visibilityState === "visible") void cargar();
        }, REFRESCO_MS);
        return () => clearInterval(id);
    }, [cargar]);

    return (
        <div className="flex flex-col gap-4">
            <h1 className="titulo-pagina mb-4">Actividades</h1>
            <div className="flex flex-wrap items-center gap-4">
                <a href="/docente/actividades/nueva" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-marca-tenue px-4 font-semibold text-marca-fuerte hover:bg-marca-suave">
                    <Plus aria-hidden="true" className="size-5" /> Agregar actividad
                </a>
                <label className="ml-auto flex items-center gap-2">
                    <span className="font-semibold">Mostrar</span>
                    <select value={estado} onChange={(e) => setEstado(e.target.value as "activas" | "todas")} className="campo w-auto py-1.5">
                        <option value="activas">Con alumnos pendientes</option>
                        <option value="todas">Todas</option>
                    </select>
                </label>
                {actualizado && <span className="text-sm text-tinta-suave" aria-live="polite">Actualizado a las {actualizado.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>

            <h2 className="mt-4 text-2xl font-bold">{estado === "activas" ? "Actividades asignadas" : "Todas las actividades"}</h2>
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!pagina && !error && <p role="status">Cargando…</p>}
            {pagina?.items.length === 0 && (
                <p className="tarjeta text-tinta-suave">
                    {estado === "activas" ? "No hay actividades con alumnos pendientes." : "Aún no has asignado actividades."}
                </p>
            )}

            {pagina?.items.map((a) => {
                const total = a.alumnos.length || 1;
                return (
                    <article key={a.actividadId} className="rounded-xl bg-superficie px-5 py-4" aria-labelledby={`act-${a.actividadId}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 id={`act-${a.actividadId}`} className="flex items-center gap-3 text-xl">
                                <NotebookText aria-hidden="true" className="size-6 shrink-0 text-tinta-suave" />
                                {a.nombre}
                            </h3>
                            <p className="text-lg">Fecha de asignación: {fecha(a.fechaAsignacion)}</p>
                        </div>
                        <p className="mt-1 pl-9 text-sm text-tinta-suave">
                            {a.tema} · {nombreTipo(a.tipoInteraccion)}{a.grupo ? ` · Grupo ${a.grupo}` : ""}
                        </p>
                        <div className="my-3 ml-9 flex h-3 overflow-hidden rounded-full bg-white" aria-hidden="true">
                            <div className="bg-exito" style={{ width: `${(a.resumen.completada / total) * 100}%` }} />
                            <div className="bg-acento" style={{ width: `${(a.resumen.enCurso / total) * 100}%` }} />
                        </div>
                        <p className="pl-9 text-sm">
                            <strong>{a.resumen.completada}</strong> completadas · <strong>{a.resumen.enCurso}</strong> en curso · <strong>{a.resumen.pendiente}</strong> pendientes
                        </p>
                        <details className="mt-3 pl-9">
                            <summary className="cursor-pointer font-bold text-marca-fuerte">Ver alumnos</summary>
                            <table className="mt-2 w-full text-left">
                                <caption className="sr-only">Avance por alumno en {a.nombre}</caption>
                                <thead>
                                    <tr className="border-b border-neutro text-sm text-tinta-suave">
                                        <th scope="col" className="py-2">Alumno</th>
                                        <th scope="col" className="py-2">Estado</th>
                                        <th scope="col" className="py-2">Avance</th>
                                        <th scope="col" className="py-2">Nivel</th>
                                        <th scope="col" className="py-2">Resultado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {a.alumnos.map((al) => {
                                        const [Icono, texto, clase] = ESTADO[al.estado];
                                        return (
                                            <tr key={al.alumnoId} className="border-b border-white">
                                                <td className="py-2"><span aria-hidden="true" className="mr-2">{emoji(al.avatar)}</span>{al.nombre}</td>
                                                <td className="py-2"><span className={`insignia-estado gap-1 ${clase}`}><Icono aria-hidden="true" className={ICONO} />{texto}</span></td>
                                                <td className="py-2">{al.resueltos}/{a.numEjercicios}</td>
                                                <td className="py-2">{al.nivelInicial === al.nivelActual ? al.nivelInicial : <>{al.nivelInicial} <ArrowRight aria-hidden="true" className={ICONO} /><span className="sr-only">a</span> {al.nivelActual}</>}</td>
                                                <td className="py-2">{al.resultadoFinal ? Number(al.resultadoFinal).toFixed(1) : "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </details>
                    </article>
                );
            })}

            {pagina?.nextCursor && (
                <button type="button" className="boton-secundario self-center" onClick={() => cargar(pagina.nextCursor!)}>Cargar más</button>
            )}
        </div>
    );
}
