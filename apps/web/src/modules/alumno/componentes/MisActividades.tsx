// A3 · Mis actividades (RF-64, EXP-04.1), según Figma "006_Dashboard del alumno": tarjetas con tema,
// estado en píldora y botón para empezar o continuar; las terminadas van en una lista desplegable.
import { useEffect, useState } from "react";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { Icono } from "../../../shared/ui/Icono";
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

// Píldora de estado de Figma: "Asignada" amarilla, "Completada" naranja
const ESTADO: Record<Actividad["estado"], { texto: string; clase: string }> = {
    pendiente: { texto: "Asignada", clase: "border-[#f1cf3c] bg-estado-asignada" },
    en_curso: { texto: "En curso", clase: "border-marca bg-marca-suave" },
    completada: { texto: "Completada", clase: "border-[#d99a2b] bg-estado-completada" },
};

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
        <section aria-labelledby="mis-actividades" className="flex flex-col gap-6">
            <h2 id="mis-actividades" className="titulo-pagina">Mis actividades</h2>
            {porHacer.length === 0 && (
                <p className="tarjeta text-center text-tinta-suave">¡No tienes actividades pendientes!</p>
            )}
            <ul className="grid gap-6 md:grid-cols-2">
                {porHacer.map((a, i) => {
                    const e = ESTADO[a.estado];
                    // Una tarjeta sola en la última fila ocupa todo el ancho en lugar de dejar media fila vacía
                    const sola = i === porHacer.length - 1 && porHacer.length % 2 === 1;
                    return (
                        <li key={a.asignacionId} className={`flex flex-col gap-4 rounded-[3rem] border border-tinta bg-superficie-tenue px-8 py-7 ${sola ? "md:col-span-2" : ""}`}>
                            <p className="text-center text-3xl font-bold">
                                <span aria-hidden="true" className="mr-2">{ICONO_TEMA[a.temaClave] ?? "📘"}</span>
                                {a.nombre}
                            </p>
                            <div>
                                <p className="font-bold">Tema:</p>
                                <ul className="list-disc pl-8">
                                    <li>{a.tema}</li>
                                </ul>
                            </div>
                            {a.estado === "en_curso" && <p>Avance: <strong>{a.progreso.resueltos} de {a.progreso.total}</strong></p>}
                            <p className="flex items-center gap-4">
                                <span className="font-bold">Estado:</span>
                                <span className={`flex-grow rounded-lg border-2 px-4 py-0.5 ${e.clase}`}>{e.texto}</span>
                            </p>
                            <a
                                href={`/alumno/actividades/${a.asignacionId}`}
                                className="mx-auto inline-flex min-h-12 min-w-52 items-center justify-center rounded-lg border-2 border-marca bg-marca-suave px-6 uppercase hover:bg-marca-claro"
                            >
                                {a.estado === "en_curso" ? "Continuar" : "Empezar"}
                            </a>
                        </li>
                    );
                })}
            </ul>
            {/* Terminadas: lista desplegable, como antes del rediseño */}
            {hechas.length > 0 && (
                <details className="tarjeta">
                    <summary className="cursor-pointer text-xl font-bold">Terminadas ({hechas.length})</summary>
                    <ul className="mt-3 flex flex-col gap-2">
                        {hechas.map((a) => (
                            <li key={a.asignacionId} className="flex items-center gap-3">
                                <Icono nombre="check" className="text-2xl" />
                                <span className="flex-grow">{a.nombre} · {a.tema}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
