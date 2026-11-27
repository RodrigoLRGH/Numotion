// Guía (RF-11) y explicación final (RF-45). Paso a paso: un paso a la vez.
// Final: todos los pasos y la respuesta correcta, al cerrar un ejercicio sin acierto.
import { useState } from "react";

export interface Guia {
    modo: "paso_a_paso" | "final";
    pasos: { orden: number; texto: string }[];
    respuestaCorrecta?: string;
}

export function GuiaPasoAPaso({ guia, onCerrar }: { guia: Guia; onCerrar(): void }) {
    const [visibles, setVisibles] = useState(guia.modo === "final" ? guia.pasos.length : 1);
    const mostrados = guia.pasos.slice(0, visibles);
    const final = guia.modo === "final";

    return (
        <section
            aria-labelledby="titulo-guia"
            // Figma "005_5_Mensaje_Motivacional": tarjeta blanca con contorno y título centrado
            className={`mx-auto mt-6 w-full max-w-3xl rounded-[2rem] border border-tinta p-6 shadow-lg ${final ? "bg-marca-tenue" : "bg-white"}`}
        >
            <div className="mb-3 flex items-center gap-3">
                <h2 id="titulo-guia" className="text-2xl font-bold">
                    {final ? "Así se resuelve" : "Vamos juntos, paso a paso"}
                </h2>
            </div>
            <ol className="flex flex-col gap-2" aria-live="polite">
                {mostrados.map((p) => (
                    <li key={p.orden} className="rounded-xl bg-superficie px-4 py-3 text-xl">
                        <span className="mr-2 font-bold text-marca-fuerte">{p.orden}.</span>
                        {p.texto}
                    </li>
                ))}
            </ol>
            {final && guia.respuestaCorrecta && (
                <p className="mt-4 text-2xl">
                    La respuesta es <strong className="rounded-lg bg-white px-3 py-1 text-3xl">{guia.respuestaCorrecta}</strong>
                </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
                {!final && visibles < guia.pasos.length && (
                    <button type="button" className="boton" onClick={() => setVisibles(visibles + 1)}>
                        Siguiente paso <span aria-hidden="true">▶</span>
                    </button>
                )}
                <button type="button" className={final ? "boton" : "boton-secundario"} onClick={onCerrar}>
                    {final ? "Seguir" : "Ya entendí"} <span aria-hidden="true">{final ? "▶" : "👍"}</span>
                </button>
            </div>
        </section>
    );
}
