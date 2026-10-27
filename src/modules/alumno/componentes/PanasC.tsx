// A2 · PANAS-C (RF-54, EXP-02.1, EXP-02.5): un ítem por pantalla, guardado incremental,
// retoma en el primer ítem sin responder. El alumno nunca ve sus puntajes.
import { useEffect, useState } from "react";
import { api, ErrorApi, irA } from "../../shared/cliente/api";
import { Aviso } from "../../shared/ui/Aviso";
import { BotonAudio } from "../../shared/ui/BotonAudio";
import { EscalaIntensidad } from "./EscalaIntensidad";

interface Item {
    id: string;
    orden: number;
    texto: string;
}
interface EstadoPanas {
    items: Item[];
    escala: { valor: number; etiqueta: string }[];
    respondidos: string[];
    completado: boolean;
}

const SIGUIENTE = "/alumno/diagnostico/matematico";

export default function PanasC() {
    const [estado, setEstado] = useState<EstadoPanas | null>(null);
    const [indice, setIndice] = useState(0);
    const [elegidos, setElegidos] = useState<Record<string, number>>({});
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<EstadoPanas>("GET", "/alumno/diagnostico/panas")
            .then((e) => {
                if (e.completado) return irA(SIGUIENTE);
                const primero = e.items.findIndex((i) => !e.respondidos.includes(i.id));
                setIndice(primero === -1 ? e.items.length - 1 : primero);
                setEstado(e);
            })
            .catch((err) => setError(err instanceof ErrorApi ? err.message : "No pudimos cargar las preguntas."));
    }, []);

    if (error && !estado) return <Aviso tipo="error">{error}</Aviso>;
    if (!estado) return <p className="text-center text-xl" role="status">Cargando…</p>;

    const item = estado.items[indice];
    const total = estado.items.length;

    async function elegir(valor: number) {
        if (ocupado) return;
        setOcupado(true);
        setError(null);
        try {
            await api("PUT", `/alumno/diagnostico/panas/respuestas/${item.id}`, { valor });
            setElegidos((e) => ({ ...e, [item.id]: valor }));
            if (indice + 1 < total) {
                setIndice(indice + 1);
            } else {
                await api("POST", "/alumno/diagnostico/panas/finalizar");
                irA(SIGUIENTE);
                return;
            }
        } catch (err) {
            if (err instanceof ErrorApi && err.status === 409) return irA(SIGUIENTE);
            // 422 al finalizar: algún ítem quedó sin guardar; se regresa al primero pendiente
            if (err instanceof ErrorApi && err.status === 422) {
                const e = await api<EstadoPanas>("GET", "/alumno/diagnostico/panas");
                setEstado(e);
                setIndice(Math.max(0, e.items.findIndex((i) => !e.respondidos.includes(i.id))));
            }
            setError(err instanceof ErrorApi ? err.message : "No se guardó. Intenta otra vez.");
        } finally {
            setOcupado(false);
        }
    }

    return (
        <section className="tarjeta mx-auto max-w-3xl" aria-labelledby="pregunta">
            <div className="mb-6 flex items-center gap-3">
                <div
                    className="h-4 flex-grow overflow-hidden rounded-full bg-slate-200"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={total}
                    aria-valuenow={indice + 1}
                    aria-label="Avance"
                >
                    <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${((indice + 1) / total) * 100}%` }} />
                </div>
                <span className="text-lg font-bold whitespace-nowrap">{indice + 1} de {total}</span>
            </div>

            <div className="mb-8 flex items-center justify-center gap-3 text-center">
                <h1 id="pregunta" className="text-3xl font-extrabold sm:text-4xl">{item.texto}</h1>
                <BotonAudio texto={`${item.texto} ${estado.escala.map((e) => e.etiqueta).join(", ")}.`} />
            </div>

            <EscalaIntensidad escala={estado.escala} elegido={elegidos[item.id]} deshabilitado={ocupado} onElegir={elegir} />

            {error && <div className="mt-5"><Aviso tipo="error">{error}</Aviso></div>}

            <div className="mt-6">
                <button type="button" className="boton-secundario" disabled={indice === 0 || ocupado} onClick={() => setIndice(indice - 1)}>
                    <span aria-hidden="true">←</span> Atrás
                </button>
            </div>
        </section>
    );
}
