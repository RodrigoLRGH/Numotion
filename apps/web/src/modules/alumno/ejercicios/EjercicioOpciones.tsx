// Selección múltiple, encuentra el número (RF-40) y completar la operación (RF-42): elegir una opción.
import { BotonOpcion } from "./BotonOpcion";
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
            {/* Figma: opciones en dos columnas con la letra en círculo amarillo */}
            <div className={`mx-auto grid max-w-4xl gap-x-16 gap-y-8 ${muchas ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`} role="group" aria-label="Opciones">
                {(ejercicio.opciones ?? []).map((o, i) => {
                    const descartada = descartadas.includes(o);
                    return (
                        <BotonOpcion
                            key={o}
                            indice={i}
                            valor={o}
                            etiqueta={descartada ? `${o}, ya intentado` : o}
                            descartada={descartada}
                            deshabilitado={deshabilitado}
                            onElegir={() => onResponder(o)}
                        />
                    );
                })}
            </div>
        </div>
    );
}
