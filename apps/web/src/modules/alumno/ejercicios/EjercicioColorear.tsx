// Colorea la figura (RF-44): se elige un color de la paleta y se tocan las figuras para pintarlas
// (tocar otra vez con el mismo color la despinta). Cada color lleva nombre y patrón para no
// depender solo del color (WCAG 1.4.1). Se envía { idFigura: color } y el servidor evalúa.
import { useEffect, useState } from "react";
import { COLORES, FORMAS } from "@numotion/core/dominio/geometria";
import type { EjercicioProps } from "./tipos";

const TRAZOS: Record<string, string> = {
    triangulo: "M50 8 L94 88 L6 88 Z",
    cuadrado: "M14 14 H86 V86 H14 Z",
    circulo: "M50 8 A42 42 0 1 1 49.99 8 Z",
    rectangulo: "M4 26 H96 V74 H4 Z",
    rombo: "M50 4 L92 50 L50 96 L8 50 Z",
    pentagono: "M50 6 L94 38 L77 90 L23 90 L6 38 Z",
    hexagono: "M27 10 H73 L96 50 L73 90 H27 L4 50 Z",
};

/** Dibujo del patrón en blanco sobre el color (10×10). */
const PATRONES: Record<string, string> = {
    rayas: "M0 2.5 H10 M0 7.5 H10",
    puntos: "M2.5 2.5 h0.01 M7.5 7.5 h0.01",
    cuadros: "M0 0 H10 V10 H0 Z M5 0 V10 M0 5 H10",
    liso: "",
    diagonal: "M0 10 L10 0 M-2 2 L2 -2 M8 12 L12 8",
    ondas: "M0 5 Q2.5 2 5 5 T10 5",
    cruces: "M3 5 H7 M5 3 V7",
    lineas: "M2.5 0 V10 M7.5 0 V10",
};

const nombreForma = (tipo: string) => FORMAS.find((f) => f.id === tipo)?.nombre ?? tipo;
const color = (id: string) => COLORES.find((c) => c.id === id);

function Defs() {
    return (
        <defs>
            {COLORES.map((c) => (
                <pattern key={c.id} id={`patron-${c.id}`} width="10" height="10" patternUnits="userSpaceOnUse">
                    <rect width="10" height="10" fill={c.hex} />
                    {PATRONES[c.patron] && <path d={PATRONES[c.patron]} stroke="white" strokeWidth={c.patron === "puntos" ? 2.5 : 1.2} strokeLinecap="round" fill="none" opacity="0.8" />}
                </pattern>
            ))}
        </defs>
    );
}

export function EjercicioColorear({ ejercicio, deshabilitado, onResponder }: EjercicioProps) {
    const [pincel, setPincel] = useState<string | null>(null);
    const [coloreo, setColoreo] = useState<Record<string, string>>({});
    useEffect(() => setColoreo({}), [ejercicio.id]);
    const figuras = ejercicio.lienzo?.figuras ?? [];

    function pintar(id: string) {
        if (!pincel || deshabilitado) return;
        setColoreo((c) => {
            const { [id]: actual, ...resto } = c;
            return actual === pincel ? resto : { ...resto, [id]: pincel };
        });
    }

    return (
        <div>
            {/* Patrones compartidos por la paleta y las figuras */}
            <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false"><Defs /></svg>

            <div className="mb-5 flex flex-wrap justify-center gap-2" role="group" aria-label="Paleta de colores">
                {COLORES.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        aria-pressed={pincel === c.id}
                        disabled={deshabilitado}
                        onClick={() => setPincel(c.id)}
                        className={`flex min-h-14 cursor-pointer items-center gap-2 rounded-2xl border-4 bg-white px-3 font-bold ${pincel === c.id ? "border-tinta" : "border-slate-200"}`}
                    >
                        <svg width="32" height="32" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                            <rect width="10" height="10" rx="2" fill={`url(#patron-${c.id})`} />
                        </svg>
                        {c.nombre}
                    </button>
                ))}
            </div>

            <p className="mb-3 text-center text-lg" aria-live="polite">
                {pincel ? <>Pincel: <strong>{color(pincel)?.nombre}</strong>. Toca una figura para pintarla.</> : "Primero elige un color."}
            </p>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4" role="group" aria-label="Figuras">
                {figuras.map((f, i) => {
                    const pintada = coloreo[f.id];
                    return (
                        <button
                            key={f.id}
                            type="button"
                            disabled={deshabilitado}
                            onClick={() => pintar(f.id)}
                            aria-label={`Figura ${i + 1}: ${nombreForma(f.tipo)}, ${pintada ? `pintada de ${color(pintada)?.nombre}` : "sin color"}`}
                            className="flex aspect-square cursor-pointer items-center justify-center rounded-2xl border-2 border-slate-200 bg-white p-2 hover:border-marca disabled:cursor-not-allowed"
                        >
                            <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" focusable="false">
                                <path d={TRAZOS[f.tipo] ?? TRAZOS.cuadrado} fill={pintada ? `url(#patron-${pintada})` : "white"} stroke="#1e293b" strokeWidth="4" strokeLinejoin="round" />
                            </svg>
                        </button>
                    );
                })}
            </div>

            <div className="mt-6 text-center">
                <button
                    type="button"
                    className="boton min-h-14 px-8 text-2xl"
                    disabled={deshabilitado || Object.keys(coloreo).length === 0}
                    onClick={() => onResponder(JSON.stringify(coloreo))}
                >
                    Comprobar <span aria-hidden="true">✓</span>
                </button>
            </div>
        </div>
    );
}
