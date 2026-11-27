// A4 · Resolver una actividad (EXP-04). El servidor decide nivel, puntos y guía; aquí se mide el
// tiempo (solo con la pestaña visible, EXP-04.4), se da retroalimentación inmediata con el hash
// (EXP-04.8) y se muestran guía, explicación final y recompensa. Sin conexión, los intentos se
// encolan y el alumno ve "Guardando…" (EXP-04.9).
// Precarga (T-03-04-21): en cuanto se cierra un ejercicio se pide el siguiente mientras el alumno
// lee la retroalimentación o la guía; "Siguiente" usa esa misma petición. Es seguro porque el
// servidor deja fijo el ejercicio vigente: pedirlo dos veces devuelve el mismo.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErrorApi, irA } from "../../../shared/cliente/api";
import { enviarIntento, sincronizarPendientes } from "../../../shared/cliente/cola-intentos";
import { coincideHash } from "../../../shared/cliente/hash";
import { Aviso } from "../../../shared/ui/Aviso";
import { Icono } from "../../../shared/ui/Icono";
import { registroEjercicios } from "../ejercicios/registro";
import type { EjercicioPublico } from "../ejercicios/tipos";
import { BurbujaPregunta } from "../ejercicios/BotonOpcion";
import { CamaraRequerida, IndicadorCamara, PreguntaAyuda, useCapturaEmocional, type OfertaAyuda } from "./CapturaEmocional";
import { Celebracion, type Insignia } from "./Gamificacion";
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
    nuevasInsignias?: Insignia[];
    subioNivel?: number | null;
    ofrecerAyuda?: OfertaAyuda | null;
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

/** `camaraPermitida`: el tutor autorizó la cámara (consentimiento vigente, de la sesión). */
export default function ResolverActividad({ asignacionId, camaraPermitida = false }: { asignacionId: string; camaraPermitida?: boolean }) {
    const [estado, setEstado] = useState<Siguiente | null>(null);
    const [descartadas, setDescartadas] = useState<string[]>([]);
    const [guia, setGuia] = useState<Guia | null>(null);
    const [ayuda, setAyuda] = useState(false);
    const [retro, setRetro] = useState<Retro>(null);
    const [cerrado, setCerrado] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const montado = useRef(true);
    useEffect(() => {
        montado.current = true; // StrictMode monta, desmonta y vuelve a montar
        return () => void (montado.current = false);
    }, []);
    const [error, setError] = useState<string | null>(null);
    const [puntosSesion, setPuntosSesion] = useState(0);
    // Al cerrar la actividad con la explicación final, la recompensa se muestra al pulsar "Seguir"
    const [recompensaPendiente, setRecompensaPendiente] = useState<Recompensa | null>(null);
    const cronometro = useCronometro();
    const precarga = useRef<Promise<Siguiente> | null>(null);
    // Gamificación y alerta temprana (EXP-05, EXP-06)
    const [insignias, setInsignias] = useState<Insignia[]>([]);
    const [nivelSubido, setNivelSubido] = useState<number | null>(null);
    const [oferta, setOferta] = useState<OfertaAyuda | null>(null);
    // Lo ganado en el último intento (se celebra entre ejercicios)
    const [celebrar, setCelebrar] = useState<{ insignias: Insignia[]; nivel: number | null } | null>(null);
    const ultimaInteraccion = useRef(performance.now());
    useEffect(() => {
        const tocar = () => void (ultimaInteraccion.current = performance.now());
        window.addEventListener("pointerdown", tocar);
        window.addEventListener("keydown", tocar);
        return () => {
            window.removeEventListener("pointerdown", tocar);
            window.removeEventListener("keydown", tocar);
        };
    }, []);
    const enEjercicio = Boolean(estado && "ejercicio" in estado) && !cerrado && !guia;
    const [reintentoCamara, setReintentoCamara] = useState(0);
    const camara = useCapturaEmocional({
        permitida: camaraPermitida,
        activa: enEjercicio,
        asignacionId,
        reintento: reintentoCamara,
        inactividadSeg: () => (performance.now() - ultimaInteraccion.current) / 1000,
        onOfrecerAyuda: (o) => setOferta((actual) => actual ?? o),
    });

    const mostrar = useCallback((s: Siguiente) => {
        setEstado(s);
        setDescartadas([]);
        setGuia(null);
        setRetro(null);
        setCerrado(false);
        if ("ejercicio" in s) {
            setAyuda(s.ayudaUsada);
            cronometro.reiniciar();
            ultimaInteraccion.current = performance.now();
        }
        setCelebrar(null);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        // Primero se reenvían intentos que quedaron guardados sin conexión, para retomar donde iban
        sincronizarPendientes()
            .then(() => api<Siguiente>("POST", `/alumno/actividades/${asignacionId}/iniciar`))
            .then(mostrar)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos abrir la actividad."));
    }, [asignacionId, mostrar]);

    const pedirSiguiente = () => api<Siguiente>("GET", `/alumno/actividades/${asignacionId}/siguiente`);

    function precargar() {
        if (precarga.current) return;
        const p = pedirSiguiente();
        p.catch(() => {}); // si falla, "Siguiente" vuelve a pedirlo
        precarga.current = p;
    }

    async function siguiente() {
        setOcupado(true);
        const precargado = precarga.current;
        precarga.current = null;
        try {
            mostrar(await (precargado ?? Promise.reject(new Error("sin precarga"))).catch(pedirSiguiente));
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
        // (solo con respuestas cerradas: el texto y el coloreo los evalúa el servidor)
        const optimista = ejercicio.hashRespuesta ? await coincideHash(ejercicio.id, respuesta, ejercicio.hashRespuesta) : null;
        if (optimista !== null) setRetro(optimista ? { tipo: "bien", puntos: null } : { tipo: "casi", restantes: null });
        try {
            const r = await enviarIntento<ResultadoIntento>(
                { clienteId: crypto.randomUUID(), asignacionId, ejercicioId: ejercicio.id, respuesta, tiempoMs, ayudaSolicitada: ayuda },
                () => setGuardando(true),
                () => montado.current,
            );
            setGuardando(false);
            setPuntosSesion((p) => p + r.puntos);
            if (r.nuevasInsignias?.length) setInsignias((l) => [...l, ...r.nuevasInsignias!.filter((n) => !l.some((x) => x.clave === n.clave))]);
            if (r.subioNivel) setNivelSubido(r.subioNivel);
            if (!r.recompensa && (r.nuevasInsignias?.length || r.subioNivel)) setCelebrar({ insignias: r.nuevasInsignias ?? [], nivel: r.subioNivel ?? null });
            if (r.ofrecerAyuda && !r.ejercicioCerrado) setOferta(r.ofrecerAyuda);
            setRetro(r.correcta ? { tipo: "bien", puntos: r.puntos } : { tipo: "casi", restantes: r.ejercicioCerrado ? 0 : r.intentosRestantes });
            if (!r.correcta) setDescartadas((d) => [...d, respuesta]);
            if (r.guia) setGuia(r.guia);
            setCerrado(r.ejercicioCerrado);
            if (r.ejercicioCerrado && !r.recompensa) precargar();
            setEstado((s) => (s && "ejercicio" in s ? { ...s, progreso: { resueltos: r.asignacion.resueltos, total: r.asignacion.total } } : s));
            if (r.recompensa) {
                const recompensa = r.recompensa;
                // Si cerró sin acierto, primero la explicación final; la recompensa al pulsar "Seguir"
                if (r.guia?.modo === "final") setRecompensaPendiente(recompensa);
                else setTimeout(() => setEstado((s) => (s ? { completada: true, recompensa, actividad: s.actividad } : s)), 900);
            }
        } catch (e) {
            setGuardando(false);
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

    async function responderOferta(acepta: boolean) {
        const o = oferta;
        setOferta(null);
        if (!o) return;
        await api("POST", `/alumno/alertas/${o.alertaId}/respuesta`, { aceptaAyuda: acepta }).catch(() => {});
        if (acepta) await pedirAyuda();
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
                <h1 id="fin" className="mt-2 text-4xl font-bold">¡Terminaste!</h1>
                <p className="mt-1 text-xl">{estado.actividad.nombre}</p>
                <p className="mt-4 flex justify-center gap-2 text-6xl" role="img" aria-label={`${recompensa.estrellas} de 3 estrellas`}>
                    {[0, 1, 2].map((i) => (
                        <Icono key={i} nombre="estrella" className={i < recompensa.estrellas ? "" : "opacity-25"} />
                    ))}
                </p>
                <p className="mt-3 text-3xl font-bold text-exito">+{recompensa.puntos} puntos</p>
                <Celebracion insignias={insignias} nivel={nivelSubido} />
                <a href="/alumno" className="boton mt-6 min-h-14 px-8 text-2xl">Volver al inicio</a>
            </section>
        );
    }

    // RC-03: si el tutor autorizó la cámara, la actividad no sigue sin ella (sin cámara autorizada nunca se enciende)
    if (camaraPermitida && (camara === "denegada" || camara === "sin_camara")) {
        return <CamaraRequerida estado={camara} onReintentar={() => setReintentoCamara((n) => n + 1)} />;
    }

    const { ejercicio, progreso, actividad } = estado;
    const Componente = registroEjercicios[ejercicio.tipoInteraccion];
    const avance = Math.round((progreso.resueltos / Math.max(1, progreso.total)) * 100);

    return (
        <section className="mx-auto flex max-w-6xl flex-col" aria-labelledby="enunciado">
            {/* Barra superior de Figma: cámara a la izquierda, actividad al centro, avance y puntos a la derecha */}
            <div className="mb-8 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
                <div className="justify-self-start"><IndicadorCamara estado={camara} /></div>
                <p className="text-center text-2xl">
                    <span className="font-bold">Actividad:</span> <span className="text-alerta">{actividad.nombre}</span>
                </p>
                <div className="flex w-full max-w-xs flex-col gap-1 justify-self-end rounded-2xl bg-superficie-tenue px-4 py-2 text-base">
                    <p className="flex justify-between gap-3">
                        <span><span className="font-bold">Ejercicio:</span> {progreso.resueltos}/{progreso.total}</span>
                        {puntosSesion > 0 && <span className="font-bold text-exito">+{puntosSesion} puntos</span>}
                    </p>
                    <div className="h-3 overflow-hidden rounded-full border border-tinta bg-white" role="progressbar" aria-label="Avance"
                        aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.resueltos}>
                        <div className="h-full rounded-full bg-linear-to-r from-marca to-marca-claro transition-all" style={{ width: `${avance}%` }} />
                    </div>
                </div>
            </div>

            <div className="mb-10">
                <BurbujaPregunta id="enunciado" numero={Math.min(progreso.resueltos + 1, progreso.total)}>
                    <span className={ejercicio.enunciado.length > 60 ? "text-2xl sm:text-3xl" : ""}>{ejercicio.enunciado}</span>
                </BurbujaPregunta>
            </div>

            {Componente ? (
                <Componente ejercicio={ejercicio} descartadas={descartadas} deshabilitado={ocupado || cerrado} onResponder={responder} />
            ) : (
                <Aviso tipo="info">Este tipo de ejercicio llegará muy pronto.</Aviso>
            )}

            <div className="mx-auto mt-8 min-h-14 w-full max-w-3xl" aria-live="polite">
                {guardando && <Aviso tipo="info">Guardando… <span className="text-base">Tu respuesta se enviará cuando vuelva el internet.</span></Aviso>}
                {/* Bandas de Figma: verde al acertar, naranja al fallar */}
                {retro?.tipo === "bien" && (
                    <p role="status" className="rounded-2xl border border-tinta bg-aviso-exito px-6 py-4 text-center text-3xl font-bold">
                        ¡Muy bien! Sigue así{retro.puntos ? ` · +${retro.puntos} puntos` : ""} <span aria-hidden="true">🎉</span>
                    </p>
                )}
                {retro?.tipo === "casi" && retro.restantes !== 0 && (
                    <p role="status" className="rounded-2xl border border-tinta bg-aviso-animo px-6 py-4 text-center text-3xl font-bold">
                        ¡Casi! No te rindas, ¡tú puedes! <span aria-hidden="true">💪</span>
                    </p>
                )}
                {error && <Aviso tipo="error">{error}</Aviso>}
                {celebrar && <Celebracion insignias={celebrar.insignias} nivel={celebrar.nivel} />}
            </div>

            {oferta && !guia && !cerrado && <PreguntaAyuda oferta={oferta} onResponder={responderOferta} />}

            {guia ? (
                <GuiaPasoAPaso key={guia.modo} guia={guia} onCerrar={cerrarGuia} />
            ) : (
                <div className="mt-8 flex flex-wrap justify-end gap-4">
                    {!cerrado && (
                        <button type="button" className="boton-secundario" onClick={pedirAyuda} disabled={ocupado}>
                            <span aria-hidden="true">💡</span> Ayuda
                        </button>
                    )}
                    {cerrado && (
                        <button type="button" className="boton order-last min-w-48 uppercase" onClick={siguiente} disabled={ocupado}>
                            Siguiente <span aria-hidden="true">▶</span>
                        </button>
                    )}
                    <button type="button" className="boton-secundario min-w-48 uppercase" onClick={() => irA("/alumno")}>
                        Salir
                    </button>
                </div>
            )}
        </section>
    );
}
