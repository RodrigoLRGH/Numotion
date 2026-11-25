// D3 · Actividades asignadas (RF-58, EXP-03.4): resumen por estado y detalle por alumno.
// Se refresca cada 30 s mientras la pestaña está visible.
import { ArrowRight, Check, Circle, Play, type LucideIcon } from "lucide-react";
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
const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" });

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
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-extrabold">Actividades asignadas</h1>
                <a href="/docente/actividades/nueva" className="boton">+ Nueva actividad</a>
            </div>
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                    <span className="etiqueta mb-0">Mostrar</span>
                    <select value={estado} onChange={(e) => setEstado(e.target.value as "activas" | "todas")} className="campo w-auto">
                        <option value="activas">Con alumnos pendientes</option>
                        <option value="todas">Todas</option>
                    </select>
                </label>
                {actualizado && <span className="text-sm text-tinta-suave" aria-live="polite">Actualizado a las {actualizado.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>

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
                    <article key={a.actividadId} className="tarjeta" aria-labelledby={`act-${a.actividadId}`}>
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h2 id={`act-${a.actividadId}`} className="text-lg font-extrabold">{a.nombre}</h2>
                            <p className="text-sm text-tinta-suave">
                                {a.tema} · {nombreTipo(a.tipoInteraccion)} · {fecha(a.fechaAsignacion)}{a.grupo ? ` · Grupo ${a.grupo}` : ""}
                            </p>
                        </div>
                        <div className="my-3 flex h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                            <div className="bg-exito" style={{ width: `${(a.resumen.completada / total) * 100}%` }} />
                            <div className="bg-acento" style={{ width: `${(a.resumen.enCurso / total) * 100}%` }} />
                        </div>
                        <p className="text-sm">
                            <strong>{a.resumen.completada}</strong> completadas · <strong>{a.resumen.enCurso}</strong> en curso · <strong>{a.resumen.pendiente}</strong> pendientes
                        </p>
                        <details className="mt-3">
                            <summary className="cursor-pointer font-bold text-marca">Ver alumnos</summary>
                            <table className="mt-2 w-full text-left">
                                <caption className="sr-only">Avance por alumno en {a.nombre}</caption>
                                <thead>
                                    <tr className="border-b border-slate-200 text-sm text-tinta-suave">
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
                                            <tr key={al.alumnoId} className="border-b border-slate-100">
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
