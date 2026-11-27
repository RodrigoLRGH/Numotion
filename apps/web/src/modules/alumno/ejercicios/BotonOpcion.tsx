// Opción de respuesta de Figma ("005_Operaciones_Basicas"): píldora con contorno y la letra en un círculo amarillo.
// La letra es decorativa: el nombre accesible es solo el valor, para que se lea "623" y no "b) 623".
import type { ReactNode } from "react";

const LETRAS = "abcdefghijklmnopqrstuvwxyz";

interface Props {
    indice: number;
    valor: string;
    etiqueta?: string;
    descartada?: boolean;
    deshabilitado?: boolean;
    onElegir(): void;
}

export function BotonOpcion({ indice, valor, etiqueta, descartada = false, deshabilitado = false, onElegir }: Props) {
    return (
        <button
            type="button"
            disabled={deshabilitado || descartada}
            onClick={onElegir}
            aria-label={etiqueta ?? valor}
            className={`group flex min-h-16 w-full cursor-pointer items-center rounded-full border text-3xl hover:border-marca-fuerte hover:bg-marca-tenue disabled:cursor-not-allowed ${
                descartada ? "border-slate-300 bg-superficie text-tinta-suave line-through" : "border-tinta bg-superficie-tenue"
            }`}
        >
            <span aria-hidden="true" className={`-my-px -ml-px flex size-16 shrink-0 items-center justify-center rounded-full text-2xl ${descartada ? "bg-neutro" : "bg-acento"}`}>
                {LETRAS[indice] ?? "•"})
            </span>
            <span className="flex-grow px-4 text-center">{valor}</span>
        </button>
    );
}

/** Burbuja celeste del enunciado: "Pregunta N." pequeño y la pregunta grande. */
export function BurbujaPregunta({ numero, children, id }: { numero?: number; children: ReactNode; id?: string }) {
    return (
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-1 rounded-[3rem] bg-marca-suave px-8 py-5 text-center">
            {numero !== undefined && <span className="text-lg font-bold">Pregunta {numero}.</span>}
            <h1 id={id} className="text-3xl sm:text-4xl">{children}</h1>
        </div>
    );
}
