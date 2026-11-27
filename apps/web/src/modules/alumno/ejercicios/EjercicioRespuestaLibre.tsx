// Respuesta escrita: la serie de números con letras (RF-39, un campo junto a cada número; tolerancia
// A-07 en el servidor) y la suma con figuras (RF-41). Sin validación optimista: la ortografía solo la
// juzga el servidor.
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
                className={`min-h-16 w-full rounded-full border border-tinta bg-superficie px-6 text-center font-bold focus:border-marca-fuerte focus:bg-white ${numerico ? "text-5xl" : "text-3xl"}`}
            />
            {descartadas.length > 0 && (
                <p className="text-lg text-tinta-suave">
                    Ya intentaste: {descartadas.map((d) => <s key={d} className="mx-1">{d}</s>)}
                </p>
            )}
            <button type="submit" className="boton min-w-48 uppercase" disabled={!limpio || deshabilitado}>
                Comprobar <span aria-hidden="true">✓</span>
            </button>
        </form>
    );
}

/** RF-39: cada número de la serie con su campo; se envía como arreglo JSON en el mismo orden. */
function SerieConLetras({ numeros, reinicio, deshabilitado, onResponder }: {
    numeros: readonly number[];
    reinicio: string;
    deshabilitado: boolean;
    onResponder(r: string): void;
}) {
    const id = useId();
    const [valores, setValores] = useState<string[]>(() => numeros.map(() => ""));
    // Solo se vacía con un ejercicio nuevo: tras un fallo el alumno corrige lo que escribió
    const clave = `${reinicio}|${numeros.join(",")}`;
    useEffect(() => setValores(clave.split("|")[1].split(",").map(() => "")), [clave]);
    const completos = valores.every((v) => v.trim() !== "");

    function enviar(e: FormEvent) {
        e.preventDefault();
        if (completos && !deshabilitado) onResponder(JSON.stringify(valores.map((v) => v.trim())));
    }

    return (
        <form onSubmit={enviar} className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <ul className="flex w-full flex-col gap-4">
                {numeros.map((n, i) => (
                    <li key={`${n}-${i}`} className="flex flex-col items-center gap-3 sm:flex-row">
                        <span aria-hidden="true" className="flex min-h-20 min-w-32 items-center justify-center rounded-full bg-aviso-animo px-5 font-mono text-4xl font-bold sm:text-5xl">
                            {n.toLocaleString("es-MX")}
                        </span>
                        <label htmlFor={`${id}-${i}`} className="sr-only">Escribe el número {n.toLocaleString("es-MX")} con letras</label>
                        <input
                            id={`${id}-${i}`}
                            value={valores[i] ?? ""}
                            onChange={(e) => setValores((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                            inputMode="text"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            maxLength={150}
                            disabled={deshabilitado}
                            className="min-h-16 w-full flex-1 rounded-full border border-tinta bg-superficie px-6 text-center text-2xl font-bold focus:border-marca-fuerte focus:bg-white"
                        />
                    </li>
                ))}
            </ul>
            <button type="submit" className="boton min-w-48 uppercase" disabled={!completos || deshabilitado}>
                Comprobar <span aria-hidden="true">✓</span>
            </button>
        </form>
    );
}

export function EjercicioNumeroAPalabras({ ejercicio, ...resto }: EjercicioProps) {
    if (ejercicio.numerosMostrados?.length) {
        return <SerieConLetras numeros={ejercicio.numerosMostrados} reinicio={ejercicio.id} deshabilitado={resto.deshabilitado} onResponder={resto.onResponder} />;
    }
    // Ejercicios guardados antes de RF-39: un solo número
    return (
        <div>
            <p className="mx-auto mb-8 flex size-48 items-center justify-center rounded-full bg-aviso-animo font-mono text-7xl font-bold sm:size-56 sm:text-8xl">{ejercicio.numeroMostrado}</p>
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
                        {i > 0 && <span aria-hidden="true" className="text-4xl font-bold">+</span>}
                        <span
                            role="img"
                            aria-label={`Grupo ${i + 1}: ${g.cantidad} ${g.cantidad === 1 ? "figura" : "figuras"}`}
                            className="grid max-w-48 grid-cols-4 gap-1 rounded-2xl border-2 border-neutro bg-white p-3 text-4xl"
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
