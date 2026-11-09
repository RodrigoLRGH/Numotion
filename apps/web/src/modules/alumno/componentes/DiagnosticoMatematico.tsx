// Diagnóstico matemático (RF-55, EXP-02.2, EXP-02.5). El servidor decide el nivel de cada
// pregunta y la califica; aquí solo se muestra, se mide el tiempo y se envía la respuesta.
import { useCallback, useEffect, useRef, useState } from "react";
import type { EjercicioPublico } from "@numotion/core/dominio/ejercicios";
import { api, ErrorApi, irA } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { BotonAudio } from "../../../shared/ui/BotonAudio";

type Pregunta = EjercicioPublico & { id: string };
type Siguiente = { pregunta: Pregunta; progreso: { temasCompletados: number; temas: number } } | { terminado: true };

const PAUSA_RETRO_MS = 900;

export default function DiagnosticoMatematico() {
    const [actual, setActual] = useState<Extract<Siguiente, { pregunta: Pregunta }> | null>(null);
    const [retro, setRetro] = useState<boolean | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inicio = useRef(0);

    const cargar = useCallback(async () => {
        setError(null);
        try {
            const s = await api<Siguiente>("GET", "/alumno/diagnostico/matematico/siguiente");
            if ("terminado" in s) {
                await api("POST", "/alumno/diagnostico/matematico/finalizar");
                irA("/alumno");
                return;
            }
            setActual(s);
            setRetro(null);
            inicio.current = performance.now();
        } catch (err) {
            // 409: falta el PANAS-C del día
            if (err instanceof ErrorApi && err.status === 409) return irA("/alumno/diagnostico/emocional");
            setError(err instanceof ErrorApi ? err.message : "No pudimos cargar la pregunta.");
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    async function responder(opcion: string) {
        if (!actual || ocupado) return;
        setOcupado(true);
        try {
            const r = await api<{ correcta: boolean }>("POST", "/alumno/diagnostico/matematico/respuestas", {
                preguntaId: actual.pregunta.id,
                respuesta: opcion,
                tiempoMs: Math.round(performance.now() - inicio.current),
            });
            setRetro(r.correcta);
            await new Promise((ok) => setTimeout(ok, PAUSA_RETRO_MS));
            await cargar();
        } catch (err) {
            // 404: ya estaba respondida (doble toque o recarga); se pide la siguiente
            if (err instanceof ErrorApi && err.status === 404) await cargar();
            else setError(err instanceof ErrorApi ? err.message : "No se guardó. Intenta otra vez.");
        } finally {
            setOcupado(false);
        }
    }

    if (error && !actual) return <Aviso tipo="error">{error}</Aviso>;
    if (!actual) return <p className="text-center text-xl" role="status">Preparando tus preguntas…</p>;

    const { pregunta, progreso } = actual;
    const avance = Math.round((progreso.temasCompletados / Math.max(1, progreso.temas)) * 100);

    return (
        <section className="tarjeta mx-auto max-w-3xl" aria-labelledby="enunciado">
            <div className="mb-6 flex items-center gap-3">
                <div className="h-4 flex-grow overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance} aria-label="Avance">
                    <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${avance}%` }} />
                </div>
                <span className="text-lg font-bold whitespace-nowrap">Tema {Math.min(progreso.temasCompletados + 1, progreso.temas)} de {progreso.temas}</span>
            </div>

            <div className="mb-6 flex items-center justify-center gap-3 text-center">
                <h1 id="enunciado" className="text-3xl font-extrabold sm:text-4xl">{pregunta.enunciado}</h1>
                <BotonAudio texto={pregunta.enunciado} />
            </div>

            {pregunta.expresion && <p className="mb-6 text-center font-mono text-5xl font-bold">{pregunta.expresion}</p>}
            {pregunta.figuras && (
                <p className="mb-6 text-center text-4xl" role="img" aria-label={pregunta.figuras.map((f) => `${f.cantidad}`).join(" más ")}>
                    {pregunta.figuras.map((f, i) => (
                        <span key={i} aria-hidden="true">{i > 0 && " + "}{f.emoji.repeat(f.cantidad)}</span>
                    ))}
                </p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(pregunta.opciones ?? []).map((o) => (
                    <button
                        key={o}
                        type="button"
                        disabled={ocupado}
                        onClick={() => responder(o)}
                        className="min-h-20 cursor-pointer rounded-2xl border-2 border-slate-200 bg-white text-3xl font-extrabold hover:border-marca hover:bg-marca-suave disabled:cursor-wait"
                    >
                        {o}
                    </button>
                ))}
            </div>

            <div className="mt-5 min-h-14" aria-live="polite">
                {retro === true && <Aviso tipo="exito">¡Muy bien! <span aria-hidden="true">🎉</span></Aviso>}
                {retro === false && <Aviso tipo="info">¡Buen intento! Sigamos <span aria-hidden="true">💪</span></Aviso>}
                {error && <Aviso tipo="error">{error}</Aviso>}
            </div>
        </section>
    );
}
