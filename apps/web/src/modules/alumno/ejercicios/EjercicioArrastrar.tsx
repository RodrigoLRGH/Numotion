// Arrastrar y soltar (RF-10). Con mouse se arrastra la ficha al recuadro; en tableta o con teclado
// se toca la ficha y luego "Comprobar" (alternativa accesible sin arrastre, RI-03).
import { useEffect, useState } from "react";
import type { EjercicioProps } from "./tipos";

export function EjercicioArrastrar({ ejercicio, descartadas, deshabilitado, onResponder }: EjercicioProps) {
    const [colocada, setColocada] = useState<string | null>(null);
    const [encima, setEncima] = useState(false);
    useEffect(() => setColocada(null), [ejercicio.id, descartadas.length]);

    const [antes, despues] = (ejercicio.expresion ?? "□").split("□");

    return (
        <div>
            <div className="mb-6 flex flex-wrap items-center justify-center gap-3 font-mono text-5xl font-bold">
                {antes && <span>{antes}</span>}
                <span
                    role="status"
                    aria-label={colocada ? `Recuadro: ${colocada}` : "Recuadro vacío"}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setEncima(true);
                    }}
                    onDragLeave={() => setEncima(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setEncima(false);
                        const v = e.dataTransfer.getData("text/plain");
                        if (v && !deshabilitado) setColocada(v);
                    }}
                    className={`inline-flex min-h-20 min-w-24 items-center justify-center rounded-2xl border-4 border-dashed px-3 ${
                        encima ? "border-marca bg-marca-suave" : colocada ? "border-marca bg-white" : "border-slate-300 bg-slate-50"
                    }`}
                >
                    {colocada ?? <span aria-hidden="true" className="text-slate-300">?</span>}
                </span>
                {despues && <span>{despues}</span>}
            </div>

            <div className="flex flex-wrap justify-center gap-3" role="group" aria-label="Fichas: toca una para ponerla en el recuadro">
                {(ejercicio.opciones ?? []).map((o) => {
                    const descartada = descartadas.includes(o);
                    return (
                        <button
                            key={o}
                            type="button"
                            draggable={!deshabilitado && !descartada}
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", o)}
                            onClick={() => setColocada(o)}
                            disabled={deshabilitado || descartada}
                            aria-pressed={colocada === o}
                            className={`min-h-16 min-w-20 cursor-grab rounded-2xl border-2 px-4 text-3xl font-bold shadow-sm active:cursor-grabbing disabled:cursor-not-allowed ${
                                descartada
                                    ? "border-neutro bg-slate-100 text-tinta-suave line-through"
                                    : colocada === o
                                      ? "border-marca bg-marca-suave"
                                      : "border-neutro bg-white hover:border-marca"
                            }`}
                        >
                            {o}
                        </button>
                    );
                })}
            </div>

            <div className="mt-6 text-center">
                <button type="button" className="boton min-w-48 uppercase" disabled={!colocada || deshabilitado} onClick={() => colocada && onResponder(colocada)}>
                    Comprobar <span aria-hidden="true">✓</span>
                </button>
            </div>
        </div>
    );
}
