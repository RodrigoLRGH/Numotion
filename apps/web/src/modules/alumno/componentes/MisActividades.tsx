// A3 · Mis actividades (RF-64, EXP-04.1): empezar pendientes, continuar en curso, ver completadas.
import { useEffect, useState } from "react";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { precargarResolver } from "./precarga";

interface Actividad {
    asignacionId: string;
    nombre: string;
    tema: string;
    temaClave: string;
    estado: "pendiente" | "en_curso" | "completada";
    progreso: { resueltos: number; total: number };
    resultadoFinal: string | null;
}

const ICONO_TEMA: Record<string, string> = { suma: "➕", resta: "➖", multiplicacion: "✖️", division: "➗", numeros: "🔢", geometria: "🔷", fracciones: "🍕" };

export default function MisActividades() {
    const [items, setItems] = useState<Actividad[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<{ items: Actividad[] }>("GET", "/alumno/actividades")
            .then((r) => setItems(r.items))
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tus actividades."));
    }, []);

    // Si hay algo por hacer, la pantalla de actividad se descarga mientras el alumno elige (T-03-04-21)
    const hayPendientes = items?.some((a) => a.estado !== "completada") ?? false;
    useEffect(() => (hayPendientes ? precargarResolver() : undefined), [hayPendientes]);

    if (error) return <Aviso tipo="error">{error}</Aviso>;
    if (!items) return <p role="status">Cargando tus actividades…</p>;

    const porHacer = items.filter((a) => a.estado !== "completada");
    const hechas = items.filter((a) => a.estado === "completada");

    return (
        <section aria-labelledby="mis-actividades" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <h2 id="mis-actividades" className="text-3xl font-extrabold">Mis actividades</h2>
            </div>
            {porHacer.length === 0 && <p className="tarjeta text-tinta-suave">¡No tienes actividades pendientes! <span aria-hidden="true">🌟</span></p>}
            <ul className="flex flex-col gap-3">
                {porHacer.map((a) => (
                    <li key={a.asignacionId} className="tarjeta flex flex-wrap items-center gap-4">
                        <span aria-hidden="true" className="text-5xl">{ICONO_TEMA[a.temaClave] ?? "📘"}</span>
                        <div className="min-w-40 flex-grow">
                            <p className="text-2xl font-extrabold">{a.nombre}</p>
                            <p className="text-tinta-suave">
                                {a.tema} · {a.estado === "en_curso" ? `${a.progreso.resueltos} de ${a.progreso.total}` : "Nueva"}
                            </p>
                        </div>
                        <a href={`/alumno/actividades/${a.asignacionId}`} className="boton min-h-14 px-6 text-xl">
                            {a.estado === "en_curso" ? "Continuar" : "Empezar"} <span aria-hidden="true">▶</span>
                        </a>
                    </li>
                ))}
            </ul>
            {hechas.length > 0 && (
                <details className="tarjeta">
                    <summary className="cursor-pointer text-xl font-bold">Terminadas ({hechas.length})</summary>
                    <ul className="mt-3 flex flex-col gap-2">
                        {hechas.map((a) => (
                            <li key={a.asignacionId} className="flex items-center gap-3">
                                <span aria-hidden="true">✅</span>
                                <span className="flex-grow">{a.nombre} · {a.tema}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
