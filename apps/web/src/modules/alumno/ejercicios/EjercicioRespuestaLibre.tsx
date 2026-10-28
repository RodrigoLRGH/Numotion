// Respuesta escrita: el número con letras (RF-39, tolerancia A-07 en el servidor) y la suma con
// figuras (RF-41). Sin validación optimista: la ortografía solo la juzga el servidor.
import { useEffect, useId, useState, type FormEvent } from "react";
import type { EjercicioProps } from "./tipos";

function Formulario({ etiqueta, numerico, descartadas, deshabilitado, onResponder, reinicio }: {
    etiqueta: string;
    numerico: boolean;
    descartadas: readonly string[];
    deshabilitado: boolean;
    onResponder(r: string): void;
    reinicio: string;
}) {
    const id = useId();
    const [valor, setValor] = useState("");
    useEffect(() => setValor(""), [reinicio, descartadas.length]);
    const limpio = valor.trim();

    function enviar(e: FormEvent) {
        e.preventDefault();
        if (limpio && !deshabilitado) onResponder(limpio);
    }

    return (
        <form onSubmit={enviar} className="mx-auto flex max-w-xl flex-col items-center gap-4">
            <label htmlFor={id} className="text-xl font-bold">{etiqueta}</label>
            <input
                id={id}
                value={valor}
                onChange={(e) => setValor(numerico ? e.target.value.replace(/\D/g, "") : e.target.value)}
                inputMode={numerico ? "numeric" : "text"}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={numerico ? 4 : 80}
                disabled={deshabilitado}
                className={`min-h-16 w-full rounded-2xl border-2 border-slate-300 bg-white px-4 text-center font-extrabold focus:border-marca ${numerico ? "text-5xl" : "text-3xl"}`}
            />
            {descartadas.length > 0 && (
                <p className="text-lg text-tinta-suave">
                    Ya intentaste: {descartadas.map((d) => <s key={d} className="mx-1">{d}</s>)}
                </p>
            )}
            <button type="submit" className="boton min-h-14 px-8 text-2xl" disabled={!limpio || deshabilitado}>
                Comprobar <span aria-hidden="true">✓</span>
            </button>
        </form>
    );
}

export function EjercicioNumeroAPalabras({ ejercicio, ...resto }: EjercicioProps) {
    return (
        <div>
            <p className="mb-6 text-center font-mono text-7xl font-extrabold">{ejercicio.numeroMostrado}</p>
            <Formulario etiqueta="Escribe el número con letras" numerico={false} reinicio={ejercicio.id} {...resto} />
        </div>
    );
}

export function EjercicioSumaFiguras({ ejercicio, ...resto }: EjercicioProps) {
    const grupos = ejercicio.figuras ?? [];
    return (
        <div>
            <ul className="mb-6 flex flex-wrap items-center justify-center gap-3" aria-label="Grupos de figuras">
                {grupos.map((g, i) => (
                    <li key={i} className="flex items-center gap-3">
                        {i > 0 && <span aria-hidden="true" className="text-4xl font-extrabold">+</span>}
                        <span
                            role="img"
                            aria-label={`Grupo ${i + 1}: ${g.cantidad} ${g.cantidad === 1 ? "figura" : "figuras"}`}
                            className="grid max-w-48 grid-cols-4 gap-1 rounded-2xl border-2 border-slate-200 bg-white p-3 text-4xl"
                        >
                            {Array.from({ length: g.cantidad }, (_, j) => <span key={j} aria-hidden="true">{g.emoji}</span>)}
                        </span>
                    </li>
                ))}
            </ul>
            <Formulario etiqueta="¿Cuántas hay en total?" numerico reinicio={ejercicio.id} {...resto} />
        </div>
    );
}
