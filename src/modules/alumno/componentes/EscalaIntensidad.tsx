// Escala Likert 1..5 de PANAS-C. Se representa la INTENSIDAD con círculos que crecen, no con
// caras: una cara feliz en "Muchísimo" contradice ítems negativos como "triste" (A-22, a validar en T-01-03).

interface Props {
    escala: { valor: number; etiqueta: string }[];
    elegido?: number;
    deshabilitado?: boolean;
    onElegir(valor: number): void;
}

const TAMANO = ["size-6", "size-9", "size-12", "size-15", "size-18"];

export function EscalaIntensidad({ escala, elegido, deshabilitado, onElegir }: Props) {
    return (
        <div role="group" aria-label="¿Cuánto?" className="grid grid-cols-5 gap-2 sm:gap-3">
            {escala.map((e, i) => {
                const activo = elegido === e.valor;
                return (
                    <button
                        key={e.valor}
                        type="button"
                        aria-pressed={activo}
                        disabled={deshabilitado}
                        onClick={() => onElegir(e.valor)}
                        className={`flex min-h-32 cursor-pointer flex-col items-center justify-start gap-3 rounded-2xl border-2 p-2 pb-3 hover:border-marca hover:bg-marca-suave disabled:cursor-wait ${
                            activo ? "border-marca bg-marca-suave" : "border-slate-200 bg-white"
                        }`}
                    >
                        {/* Zonas de altura fija: los círculos quedan alineados aunque la etiqueta ocupe dos líneas */}
                        <span aria-hidden="true" className="flex h-20 items-end justify-center">
                            <span className={`${TAMANO[i] ?? "size-12"} rounded-full bg-acento`} />
                        </span>
                        <span className="flex min-h-12 items-center text-base leading-tight font-bold sm:text-lg">{e.etiqueta}</span>
                    </button>
                );
            })}
        </div>
    );
}
