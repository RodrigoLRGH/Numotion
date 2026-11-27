// Piezas visuales de gamificación (EXP-06, wireframes A3, A6, A7): personaje, nivel, racha L–V,
// insignias, mensaje motivacional y celebraciones. Solo refuerzo positivo, sin comparaciones.
import type { ReactNode } from "react";
import { Icono } from "../../../shared/ui/Icono";

export interface Accesorio {
    nivel: number;
    emoji: string;
    nombre: string;
}
export interface Gamificacion {
    nivel: number;
    puntos: number;
    puntosNivel: number;
    puntosSiguienteNivel: number | null;
    porcentaje: number;
    personaje: { emoji: string; nombre: string; accesorios: Accesorio[]; accesorioActual: Accesorio | null };
}
export interface Insignia {
    clave: string;
    nombre: string;
    descripcion: string;
    icono: string;
    obtenidaEn?: string | null;
}
export interface DiaSemana {
    fecha: string;
    dia: string;
    hecho: boolean;
    esHoy: boolean;
    futuro: boolean;
}

const NOMBRE_DIA: Record<string, string> = { L: "lunes", M: "martes", Mi: "miércoles", J: "jueves", V: "viernes" };

export function Personaje({ g, tamano = "normal" }: { g: Gamificacion; tamano?: "normal" | "grande" }) {
    const acc = g.personaje.accesorioActual;
    return (
        <span
            role="img"
            aria-label={`Tu ${g.personaje.nombre}${acc ? ` con ${acc.nombre.toLowerCase()}` : ""}`}
            className={`relative inline-flex items-center justify-center rounded-full bg-acento-suave ${tamano === "grande" ? "size-32 text-7xl" : "size-16 text-4xl"}`}
        >
            <span aria-hidden="true">{g.personaje.emoji}</span>
            {acc && (
                <span aria-hidden="true" className={`absolute -right-1 -bottom-1 rounded-full bg-white shadow ${tamano === "grande" ? "p-1 text-4xl" : "text-2xl"}`}>
                    {acc.emoji}
                </span>
            )}
        </span>
    );
}

export function BarraNivel({ g, gruesa = false }: { g: Gamificacion; gruesa?: boolean }) {
    return (
        <div className="min-w-40 flex-grow">
            <p className={`font-bold ${gruesa ? "text-2xl" : ""}`}>
                Nivel {g.nivel} · <span className="text-marca-fuerte">{g.puntos} puntos</span>
            </p>
            <div
                className={`overflow-hidden rounded-full border border-tinta bg-white ${gruesa ? "mt-3 h-8 border-2" : "mt-1 h-4"}`}
                role="progressbar"
                aria-label={g.puntosSiguienteNivel === null ? "Nivel máximo" : `Avance al nivel ${g.nivel + 1}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={g.porcentaje}
            >
                <div className="h-full rounded-full bg-linear-to-r from-marca to-marca-claro transition-all" style={{ width: `${g.porcentaje}%` }} />
            </div>
            {g.puntosSiguienteNivel !== null && (
                <p className="mt-1 text-base text-tinta-suave">Te faltan {g.puntosSiguienteNivel - g.puntos} para el nivel {g.nivel + 1}</p>
            )}
        </div>
    );
}

/** EXP-06.3: racha en días con la semana L–V y la mejor racha; nunca en tono negativo. */
/** `accion`: elemento opcional que se muestra arriba a la derecha (p. ej. el botón "Activar racha" del panel). */
export function RachaVisual({ actual, mejor, semana, accion }: { actual: number; mejor: number; semana: DiaSemana[]; accion?: ReactNode }) {
    return (
        <section aria-labelledby="titulo-racha" className="tarjeta sm:rounded-[3rem] sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
                {actual > 0 && <span aria-hidden="true" className="text-5xl"><Icono nombre="fuego" /></span>}
                <div className="flex-grow">
                    <h2 id="titulo-racha" className="text-2xl font-bold">
                        {actual > 0 ? `Racha: ${actual} ${actual === 1 ? "día" : "días"}` : "¡Empieza una nueva racha hoy!"}
                    </h2>
                    <p className="text-tinta-suave">Mejor racha: {mejor} {mejor === 1 ? "día" : "días"}</p>
                </div>
                {accion}
            </div>
            {/* Días en una franja centrada (máx. 768 px) con separación uniforme; el espacio sobrante queda a
                los lados. En pantallas angostas la franja ocupa todo el ancho. */}
            <ol className="mx-auto mt-4 flex w-full max-w-3xl justify-between gap-2" aria-label="Días de esta semana">
                {semana.map((d) => (
                    <li key={d.fecha} className="flex flex-col items-center gap-1">
                        <span
                            className={`flex size-12 items-center justify-center rounded-full border-2 text-2xl ${
                                d.hecho ? "border-acento bg-acento" : d.esHoy ? "border-marca bg-white" : "border-slate-300 bg-slate-100"
                            }`}
                        >
                            <span aria-hidden="true" className="flex">
                                {/* La estrella de hoy llena todo el interior del círculo (48 px − 2 px de borde por lado) */}
                                {d.hecho ? <Icono nombre="fuego" /> : d.esHoy ? <Icono nombre="estrella" className="text-[2.75rem]" /> : ""}
                            </span>
                        </span>
                        <span className={`font-bold ${d.esHoy ? "text-marca-fuerte" : ""}`}>{d.dia}</span>
                        <span className="sr-only">
                            {NOMBRE_DIA[d.dia] ?? d.dia}: {d.hecho ? "practicaste" : d.futuro ? "todavía no llega" : d.esHoy ? "hoy, aún puedes practicar" : "sin práctica"}
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export function MensajeMotivacional({ texto }: { texto: string }) {
    return (
        <section aria-label="Mensaje del día" className="flex items-center justify-center gap-3 rounded-2xl bg-linear-to-r from-burbuja-inicio to-burbuja-fin px-6 py-4">
            <p className="text-center text-2xl">{texto}</p>
        </section>
    );
}

/** Fila de medallas: las obtenidas a color y huecos en gris hasta completar `total`. Decorativa (el enlace da el texto). */
export function FilaInsignias({ obtenidas, total = 5 }: { obtenidas: Insignia[]; total?: number }) {
    const huecos = Math.max(0, total - obtenidas.length);
    return (
        <span aria-hidden="true" className="flex gap-1.5 text-4xl">
            {obtenidas.slice(0, total).map((i) => <span key={i.clave}>{i.icono}</span>)}
            {Array.from({ length: huecos }, (_, n) => <span key={n} className="opacity-50 grayscale">🏅</span>)}
        </span>
    );
}

export function ListaInsignias({ obtenidas, pendientes = [] }: { obtenidas: Insignia[]; pendientes?: Insignia[] }) {
    if (obtenidas.length === 0 && pendientes.length === 0) return null;
    return (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {obtenidas.map((i) => (
                <li key={i.clave} className="flex flex-col items-center rounded-2xl border-2 border-acento bg-acento-suave p-3 text-center">
                    <span aria-hidden="true" className="text-5xl">{i.icono}</span>
                    <span className="mt-1 font-bold">{i.nombre}</span>
                    <span className="text-base text-tinta-suave">{i.descripcion}</span>
                </li>
            ))}
            {pendientes.map((i) => (
                <li key={i.clave} className="flex flex-col items-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-center">
                    <span aria-hidden="true" className="text-5xl opacity-40 grayscale">{i.icono}</span>
                    <span className="mt-1 font-bold text-tinta-suave">{i.nombre}</span>
                    <span className="text-base text-tinta-suave">
                        <span className="sr-only">Por ganar: </span>
                        {i.descripcion}
                    </span>
                </li>
            ))}
        </ul>
    );
}

/** Animación al ganar insignias o subir de nivel (EXP-06.1). Respeta prefers-reduced-motion (global.css). */
export function Celebracion({ insignias, nivel }: { insignias: Insignia[]; nivel: number | null }) {
    if (insignias.length === 0 && nivel === null) return null;
    return (
        <div role="status" className="mt-4 flex flex-col gap-2">
            {nivel !== null && (
                <p className="animate-bounce rounded-2xl bg-acento-suave px-4 py-3 text-2xl font-bold">
                    <span aria-hidden="true">🆙 </span>¡Subiste al nivel {nivel}! Tu personaje tiene un accesorio nuevo
                </p>
            )}
            {insignias.map((i) => (
                <p key={i.clave} className="animate-bounce rounded-2xl bg-acento-suave px-4 py-3 text-2xl font-bold">
                    <span aria-hidden="true">{i.icono} </span>Nueva insignia: {i.nombre}
                </p>
            ))}
        </div>
    );
}
