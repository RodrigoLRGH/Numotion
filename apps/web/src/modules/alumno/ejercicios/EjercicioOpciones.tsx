// Selección múltiple, encuentra el número (RF-40) y completar la operación (RF-42): elegir una opción.
import type { EjercicioProps } from "./tipos";

export function EjercicioOpciones({ ejercicio, descartadas, deshabilitado, onResponder }: EjercicioProps) {
    const muchas = (ejercicio.opciones?.length ?? 0) > 6;
    return (
        <div>
            {ejercicio.expresion && (
                <p className="mb-6 text-center font-mono text-5xl font-bold" aria-label={ejercicio.expresion.replace("□", "espacio vacío")}>
                    {ejercicio.expresion}
                </p>
            )}
            <div className={`grid gap-3 ${muchas ? "grid-cols-3 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`} role="group" aria-label="Opciones">
                {(ejercicio.opciones ?? []).map((o) => {
                    const descartada = descartadas.includes(o);
                    return (
                        <button
                            key={o}
                            type="button"
                            disabled={deshabilitado || descartada}
                            onClick={() => onResponder(o)}
                            aria-label={descartada ? `${o}, ya intentado` : o}
                            className={`min-h-20 cursor-pointer rounded-2xl border-2 text-3xl font-extrabold hover:border-marca hover:bg-marca-suave disabled:cursor-not-allowed ${
                                descartada ? "border-slate-200 bg-slate-100 text-tinta-suave line-through" : "border-slate-200 bg-white"
                            }`}
                        >
                            {o}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
