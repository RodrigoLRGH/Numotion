// A4 · Resolver una actividad (EXP-04). El servidor decide nivel, puntos y guía; aquí se mide el
// tiempo (solo con la pestaña visible, EXP-04.4), se da retroalimentación inmediata con el hash
// (EXP-04.8) y se muestran guía, explicación final y recompensa.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErrorApi, irA } from "../../shared/cliente/api";
import { coincideHash } from "../../shared/cliente/hash";
import { hablar } from "../../shared/cliente/voz";
import { Aviso } from "../../shared/ui/Aviso";
import { BotonAudio } from "../../shared/ui/BotonAudio";
import { registroEjercicios } from "../ejercicios/registro";
import type { EjercicioPublico } from "../ejercicios/tipos";
import { GuiaPasoAPaso, type Guia } from "./GuiaPasoAPaso";

interface Recompensa {
    puntos: number;
    estrellas: 1 | 2 | 3;
    resultadoFinal: number;
}
type Siguiente =
    | { ejercicio: EjercicioPublico; intentosUsados: number; ayudaUsada: boolean; actividad: { nombre: string }; progreso: { resueltos: number; total: number } }
    | { completada: true; recompensa: Recompensa; actividad: { nombre: string } };
interface ResultadoIntento {
    correcta: boolean;
    puntos: number;
    ejercicioCerrado: boolean;
    intentosRestantes: number;
    guia: Guia | null;
    asignacion: { estado: string; resueltos: number; total: number };
    recompensa: Recompensa | null;
}

type Retro = { tipo: "bien"; puntos: number | null } | { tipo: "casi"; restantes: number | null } | null;

/** Cronómetro que no cuenta el tiempo con la pestaña oculta. */
function useCronometro() {
    const acumulado = useRef(0);
    const desde = useRef<number | null>(null);
    useEffect(() => {
        const cambio = () => {
            if (document.visibilityState === "hidden" && desde.current !== null) {
                acumulado.current += performance.now() - desde.current;
                desde.current = null;
            } else if (document.visibilityState === "visible" && desde.current === null) {
                desde.current = performance.now();
            }
        };
        document.addEventListener("visibilitychange", cambio);
        return () => document.removeEventListener("visibilitychange", cambio);
    }, []);
    return {
        reiniciar() {
            acumulado.current = 0;
            desde.current = document.visibilityState === "visible" ? performance.now() : null;
        },
        leer() {
            return Math.round(acumulado.current + (desde.current !== null ? performance.now() - desde.current : 0));
        },
    };
}

export default function ResolverActividad({ asignacionId }: { asignacionId: string }) {
    const [estado, setEstado] = useState<Siguiente | null>(null);
    const [descartadas, setDescartadas] = useState<string[]>([]);
    const [guia, setGuia] = useState<Guia | null>(null);
    const [ayuda, setAyuda] = useState(false);
    const [retro, setRetro] = useState<Retro>(null);
    const [cerrado, setCerrado] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [puntosSesion, setPuntosSesion] = useState(0);
    // Al cerrar la actividad con la explicación final, la recompensa se muestra al pulsar "Seguir"
    const [recompensaPendiente, setRecompensaPendiente] = useState<Recompensa | null>(null);
    const cronometro = useCronometro();

    const mostrar = useCallback((s: Siguiente) => {
        setEstado(s);
        setDescartadas([]);
        setGuia(null);
        setRetro(null);
        setCerrado(false);
        if ("ejercicio" in s) {
            setAyuda(s.ayudaUsada);
            cronometro.reiniciar();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        api<Siguiente>("POST", `/alumno/actividades/${asignacionId}/iniciar`)
            .then(mostrar)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos abrir la actividad."));
    }, [asignacionId, mostrar]);

    async function siguiente() {
        setOcupado(true);
        try {
            mostrar(await api<Siguiente>("GET", `/alumno/actividades/${asignacionId}/siguiente`));
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No pudimos cargar el siguiente ejercicio.");
        } finally {
            setOcupado(false);
        }
    }

    async function responder(respuesta: string) {
        if (!estado || !("ejercicio" in estado) || ocupado) return;
        const ejercicio = estado.ejercicio;
        setOcupado(true);
        setError(null);
        const tiempoMs = cronometro.leer();
        // Retroalimentación inmediata; el servidor confirma (y manda si difiere)
        const optimista = await coincideHash(ejercicio.id, respuesta, ejercicio.hashRespuesta);
        if (optimista !== null) setRetro(optimista ? { tipo: "bien", puntos: null } : { tipo: "casi", restantes: null });
        try {
            const r = await api<ResultadoIntento>("POST", "/alumno/intentos", {
                clienteId: crypto.randomUUID(),
                asignacionId,
                ejercicioId: ejercicio.id,
                respuesta,
                tiempoMs,
                ayudaSolicitada: ayuda,
            });
            setPuntosSesion((p) => p + r.puntos);
            setRetro(r.correcta ? { tipo: "bien", puntos: r.puntos } : { tipo: "casi", restantes: r.ejercicioCerrado ? 0 : r.intentosRestantes });
            hablar(r.correcta ? "¡Muy bien!" : r.ejercicioCerrado ? "Veamos cómo se resuelve" : "¡Casi! Intenta otra vez");
            if (!r.correcta) setDescartadas((d) => [...d, respuesta]);
            if (r.guia) setGuia(r.guia);
            setCerrado(r.ejercicioCerrado);
            setEstado((s) => (s && "ejercicio" in s ? { ...s, progreso: { resueltos: r.asignacion.resueltos, total: r.asignacion.total } } : s));
            if (r.recompensa) {
                const recompensa = r.recompensa;
                // Si cerró sin acierto, primero la explicación final; la recompensa al pulsar "Seguir"
                if (r.guia?.modo === "final") setRecompensaPendiente(recompensa);
                else setTimeout(() => setEstado((s) => (s ? { completada: true, recompensa, actividad: s.actividad } : s)), 900);
            }
        } catch (e) {
            setRetro(null);
            setError(e instanceof ErrorApi ? e.message : "No se guardó tu respuesta. Intenta otra vez.");
        } finally {
            setOcupado(false);
        }
    }

    async function pedirAyuda() {
        if (!estado || !("ejercicio" in estado)) return;
        try {
            setGuia(await api<Guia>("POST", `/alumno/ejercicios/${estado.ejercicio.id}/guia`, { asignacionId }));
            setAyuda(true);
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No pudimos abrir la ayuda.");
        }
    }

    function cerrarGuia() {
        setGuia(null);
        if (recompensaPendiente && estado) return setEstado({ completada: true, recompensa: recompensaPendiente, actividad: estado.actividad });
        if (cerrado) void siguiente();
    }

    if (error && !estado) return <Aviso tipo="error">{error}</Aviso>;
    if (!estado) return <p className="text-center text-xl" role="status">Preparando tu actividad…</p>;

    if ("completada" in estado) {
        const { recompensa } = estado;
        return (
            <section className="tarjeta mx-auto max-w-xl text-center" aria-labelledby="fin">
                <p aria-hidden="true" className="text-7xl">🎉</p>
                <h1 id="fin" className="mt-2 text-4xl font-extrabold">¡Terminaste!</h1>
                <p className="mt-1 text-xl">{estado.actividad.nombre}</p>
                <p className="mt-4 text-6xl" role="img" aria-label={`${recompensa.estrellas} de 3 estrellas`}>
                    {"⭐".repeat(recompensa.estrellas)}
                    <span className="opacity-25">{"⭐".repeat(3 - recompensa.estrellas)}</span>
                </p>
                <p className="mt-3 text-3xl font-extrabold text-exito">+{recompensa.puntos} puntos</p>
                <a href="/alumno" className="boton mt-6 min-h-14 px-8 text-2xl">Volver al inicio</a>
            </section>
        );
    }

    const { ejercicio, progreso, actividad } = estado;
    const Componente = registroEjercicios[ejercicio.tipoInteraccion];
    const avance = Math.round((progreso.resueltos / Math.max(1, progreso.total)) * 100);

    return (
        <section className="tarjeta mx-auto max-w-3xl" aria-labelledby="enunciado">
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <p className="font-extrabold">{actividad.nombre}</p>
                <div className="h-4 min-w-32 flex-grow overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Avance"
                    aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.resueltos}>
                    <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${avance}%` }} />
                </div>
                <span className="font-bold whitespace-nowrap">{progreso.resueltos}/{progreso.total}</span>
                {puntosSesion > 0 && <span className="rounded-full bg-exito-suave px-3 py-1 font-bold text-exito">+{puntosSesion}</span>}
            </div>

            <div className="mb-6 flex items-center justify-center gap-3 text-center">
                <h1 id="enunciado" className="text-3xl font-extrabold sm:text-4xl">{ejercicio.enunciado}</h1>
                <BotonAudio texto={ejercicio.enunciado} />
            </div>

            {Componente ? (
                <Componente ejercicio={ejercicio} descartadas={descartadas} deshabilitado={ocupado || cerrado} onResponder={responder} />
            ) : (
                <Aviso tipo="info">Este tipo de ejercicio llegará muy pronto.</Aviso>
            )}

            <div className="mt-5 min-h-14" aria-live="polite">
                {retro?.tipo === "bien" && <Aviso tipo="exito">¡Muy bien!{retro.puntos ? ` +${retro.puntos} puntos` : ""} <span aria-hidden="true">🎉</span></Aviso>}
                {retro?.tipo === "casi" && retro.restantes !== 0 && <Aviso tipo="info">¡Casi! Intenta otra vez <span aria-hidden="true">💪</span></Aviso>}
                {error && <Aviso tipo="error">{error}</Aviso>}
            </div>

            {guia ? (
                <GuiaPasoAPaso key={guia.modo} guia={guia} onCerrar={cerrarGuia} />
            ) : (
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                    {!cerrado && (
                        <button type="button" className="boton-secundario" onClick={pedirAyuda} disabled={ocupado}>
                            <span aria-hidden="true">💡</span> Ayuda
                        </button>
                    )}
                    {cerrado && (
                        <button type="button" className="boton min-h-14 px-8 text-2xl" onClick={siguiente} disabled={ocupado}>
                            Siguiente <span aria-hidden="true">▶</span>
                        </button>
                    )}
                    <button type="button" className="boton-secundario" onClick={() => irA("/alumno")}>
                        Salir
                    </button>
                </div>
            )}
        </section>
    );
}
