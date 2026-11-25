// Práctica libre (EXP-06.6, RF-03, RF-67): el alumno elige un juego (tema × tipo), resuelve 5
// ejercicios a su nivel del tema y al terminar gana puntos y suma racha (una vez por día hábil).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { coincideHash } from "../../../shared/cliente/hash";
import { Aviso } from "../../../shared/ui/Aviso";
import { registroEjercicios } from "../ejercicios/registro";
import type { EjercicioPublico } from "../ejercicios/tipos";
import { Celebracion, type Insignia } from "./Gamificacion";
import { GuiaPasoAPaso, type Guia } from "./GuiaPasoAPaso";

interface Juego {
    tipo: string;
    temaId: string;
    temaClave: string;
    tema: string;
    nombre: string;
    icono: string;
}
interface Practica {
    practicaId: string;
    nivel: number;
    tema: string;
    juego: string;
    ejercicios: EjercicioPublico[];
}
interface ResultadoIntento {
    correcta: boolean;
    ejercicioCerrado: boolean;
    intentosRestantes: number;
    solucion: { pasos: { orden: number; texto: string }[]; respuestaCorrecta: string } | null;
    progreso: { resueltos: number; total: number };
}
interface Completada {
    puntos: number;
    aciertos: number;
    total: number;
    racha: { actual: number; mejor: number; incremento: boolean };
    nuevasInsignias: Insignia[];
    subioNivel: number | null;
}

export default function PracticaLibre() {
    const [juegos, setJuegos] = useState<Juego[] | null>(null);
    const [practica, setPractica] = useState<Practica | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);

    useEffect(() => {
        api<{ items: Juego[] }>("GET", "/alumno/practica")
            .then((r) => setJuegos(r.items))
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar los juegos."));
    }, []);

    const porTema = useMemo(() => {
        const m = new Map<string, Juego[]>();
        for (const j of juegos ?? []) m.set(j.tema, [...(m.get(j.tema) ?? []), j]);
        return [...m.entries()];
    }, [juegos]);

    async function empezar(j: Juego) {
        setCargando(true);
        setError(null);
        try {
            setPractica(await api<Practica>("POST", "/alumno/practica", { tipo: j.tipo, temaId: j.temaId }));
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No pudimos empezar el juego.");
        } finally {
            setCargando(false);
        }
    }

    if (practica) return <Jugar practica={practica} onOtro={() => setPractica(null)} />;

    return (
        <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold"><span aria-hidden="true">🎮 </span>Jugar libre</h1>
            </div>
            <p className="text-tinta-suave">Cada juego tiene 5 retos. ¡Termina uno hoy para que crezca tu racha! <span aria-hidden="true">🔥</span></p>
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!juegos && !error && <p role="status">Cargando juegos…</p>}
            {porTema.map(([tema, lista]) => (
                <section key={tema} aria-labelledby={`tema-${lista[0].temaClave}`} className="tarjeta">
                    <h2 id={`tema-${lista[0].temaClave}`} className="mb-3 text-2xl font-extrabold">{tema}</h2>
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {lista.map((j) => (
                            <li key={j.tipo}>
                                <button type="button" className="boton-secundario w-full justify-start text-xl" disabled={cargando} onClick={() => empezar(j)}>
                                    <span aria-hidden="true" className="text-3xl">{j.icono}</span> {j.nombre}
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
            <Link to="/alumno" className="boton-secundario self-center">← Volver a mi panel</Link>
        </div>
    );
}

function Jugar({ practica, onOtro }: { practica: Practica; onOtro(): void }) {
    const [indice, setIndice] = useState(0);
    const [descartadas, setDescartadas] = useState<string[]>([]);
    const [retro, setRetro] = useState<"bien" | "casi" | null>(null);
    const [cerrado, setCerrado] = useState(false);
    const [solucion, setSolucion] = useState<Guia | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fin, setFin] = useState<Completada | null>(null);
    const inicio = useRef(performance.now());

    const ejercicio = practica.ejercicios[indice];
    const Componente = ejercicio ? registroEjercicios[ejercicio.tipoInteraccion] : undefined;

    async function completar() {
        setOcupado(true);
        try {
            const r = await api<Completada>("POST", `/alumno/practica/${practica.practicaId}/completar`);
            setFin(r);
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No pudimos guardar el final del juego.");
        } finally {
            setOcupado(false);
        }
    }

    function siguiente() {
        if (indice + 1 >= practica.ejercicios.length) return void completar();
        setIndice((i) => i + 1);
        setDescartadas([]);
        setRetro(null);
        setCerrado(false);
        setSolucion(null);
        inicio.current = performance.now();
    }

    async function responder(respuesta: string) {
        if (ocupado || cerrado) return;
        setOcupado(true);
        setError(null);
        const optimista = ejercicio.hashRespuesta ? await coincideHash(ejercicio.id, respuesta, ejercicio.hashRespuesta) : null;
        if (optimista !== null) setRetro(optimista ? "bien" : "casi");
        try {
            const r = await api<ResultadoIntento>("POST", `/alumno/practica/${practica.practicaId}/intentos`, {
                clienteId: crypto.randomUUID(),
                ejercicioId: ejercicio.id,
                respuesta,
                tiempoMs: Math.round(performance.now() - inicio.current),
            });
            setRetro(r.correcta ? "bien" : "casi");
            if (!r.correcta) setDescartadas((d) => [...d, respuesta]);
            setCerrado(r.ejercicioCerrado);
            if (r.solucion) setSolucion({ modo: "final", pasos: r.solucion.pasos, respuestaCorrecta: r.solucion.respuestaCorrecta });
        } catch (e) {
            setRetro(null);
            setError(e instanceof ErrorApi ? e.message : "No se guardó tu respuesta. Intenta otra vez.");
        } finally {
            setOcupado(false);
        }
    }

    if (fin) {
        return (
            <section className="tarjeta mx-auto max-w-xl text-center" aria-labelledby="fin-juego">
                <p aria-hidden="true" className="text-7xl">🎉</p>
                <h1 id="fin-juego" className="mt-2 text-4xl font-extrabold">¡Terminaste el juego!</h1>
                <p className="mt-2 text-2xl">Acertaste {fin.aciertos} de {fin.total}</p>
                <p className="mt-3 text-3xl font-extrabold text-exito">+{fin.puntos} puntos</p>
                <p className="mt-3 text-2xl">
                    <span aria-hidden="true">🔥 </span>
                    {fin.racha.incremento ? `¡Tu racha creció a ${fin.racha.actual} ${fin.racha.actual === 1 ? "día" : "días"}!` : fin.racha.actual > 0 ? `Racha: ${fin.racha.actual} días` : "¡Vuelve el lunes para empezar tu racha!"}
                </p>
                <Celebracion insignias={fin.nuevasInsignias} nivel={fin.subioNivel} />
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <button type="button" className="boton min-h-14 px-6 text-xl" onClick={onOtro}>Jugar otro <span aria-hidden="true">🎮</span></button>
                    <Link to="/alumno" className="boton-secundario min-h-14 px-6 text-xl">Volver al inicio</Link>
                </div>
            </section>
        );
    }

    return (
        <section className="tarjeta mx-auto max-w-3xl" aria-labelledby="enunciado-practica">
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <p className="font-extrabold">{practica.juego} · {practica.tema}</p>
                <div className="h-4 min-w-32 flex-grow overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Avance del juego"
                    aria-valuemin={0} aria-valuemax={practica.ejercicios.length} aria-valuenow={indice + (cerrado ? 1 : 0)}>
                    <div className="h-full rounded-full bg-acento transition-all" style={{ width: `${((indice + (cerrado ? 1 : 0)) / practica.ejercicios.length) * 100}%` }} />
                </div>
                <span className="font-bold">{indice + 1}/{practica.ejercicios.length}</span>
            </div>
            <div className="mb-6 flex items-center justify-center gap-3 text-center">
                <h1 id="enunciado-practica" className="text-3xl font-extrabold">{ejercicio.enunciado}</h1>
            </div>
            {Componente ? (
                <Componente key={ejercicio.id} ejercicio={ejercicio} descartadas={descartadas} deshabilitado={ocupado || cerrado} onResponder={responder} />
            ) : (
                <Aviso>Este juego llegará muy pronto.</Aviso>
            )}
            <div className="mt-5 min-h-14" aria-live="polite">
                {retro === "bien" && <Aviso tipo="exito">¡Muy bien! <span aria-hidden="true">🎉</span></Aviso>}
                {retro === "casi" && !cerrado && <Aviso>¡Casi! Intenta otra vez <span aria-hidden="true">💪</span></Aviso>}
                {error && <Aviso tipo="error">{error}</Aviso>}
            </div>
            {solucion ? (
                <GuiaPasoAPaso guia={solucion} onCerrar={siguiente} />
            ) : (
                cerrado && (
                    <div className="mt-4 flex justify-center">
                        <button type="button" className="boton min-h-14 px-8 text-2xl" onClick={siguiente} disabled={ocupado}>
                            {indice + 1 >= practica.ejercicios.length ? "Terminar" : "Siguiente"} <span aria-hidden="true">▶</span>
                        </button>
                    </div>
                )
            )}
        </section>
    );
}
