// Etiquetas de estados emocionales para el docente: siempre ícono + texto (nunca solo color, RI-01)
// y lenguaje de señales observadas, no diagnósticos (EXP-07, Lenguaje).
import { CircleDashed, EyeOff, Frown, Meh, Smile, type LucideIcon } from "lucide-react";

export const ESTADO: Record<string, { icono: LucideIcon; texto: string; clase: string }> = {
    positivo: { icono: Smile, texto: "Positivo", clase: "bg-exito-suave text-exito" },
    neutral: { icono: Meh, texto: "Neutral", clase: "bg-slate-100 text-tinta" },
    frustracion: { icono: Frown, texto: "Frustración", clase: "bg-alerta-suave text-alerta" },
    desinteres: { icono: EyeOff, texto: "Desinterés", clase: "bg-acento-suave text-tinta" },
    sin_dato: { icono: CircleDashed, texto: "Sin dato", clase: "bg-slate-100 text-tinta-suave" },
};

/** Ícono decorativo en línea con el texto (el significado siempre lo da el texto). */
export const ICONO = "inline-block size-4 shrink-0 align-[-0.125em]";

export function IconoEstado({ estado }: { estado: string | null }) {
    const Icono = (ESTADO[estado ?? "sin_dato"] ?? ESTADO.sin_dato).icono;
    return <Icono aria-hidden="true" className={ICONO} />;
}

export function EtiquetaEstado({ estado }: { estado: string | null }) {
    const e = ESTADO[estado ?? "sin_dato"] ?? ESTADO.sin_dato;
    return (
        <span className={`insignia-estado gap-1 ${e.clase}`}>
            <IconoEstado estado={estado} /> {e.texto}
        </span>
    );
}

export const AVISO_ESTIMACION = "Los estados socioemocionales son estimaciones automáticas de apoyo y no sustituyen el criterio docente.";

export const fechaCorta = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
export const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Barra horizontal con su valor en texto (accesible sin depender del color). */
export function Barra({ valor, max, etiqueta, clase = "bg-marca" }: { valor: number; max: number; etiqueta: string; clase?: string }) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="h-3 min-w-24 flex-grow overflow-hidden rounded-full bg-slate-200" role="img" aria-label={etiqueta}>
                <div className={`h-full rounded-full ${clase}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

// Explicaciones de AP y AN (PANAS-C: escala 1–5, promedio de cada subescala; umbrales en estadoInicialDesdePanas)
export const AYUDA_AP = (
    <>
        <strong>Afecto positivo.</strong> Promedio, del 1 al 5, de qué tanto el alumno dijo sentir emociones agradables (como alegría o
        interés) en el cuestionario del inicio del día. Más alto significa mejor ánimo para trabajar.
    </>
);
export const AYUDA_AN = (
    <>
        <strong>Afecto negativo.</strong> Promedio, del 1 al 5, de qué tanto el alumno dijo sentir emociones desagradables (como tristeza,
        miedo o enojo) en el cuestionario del inicio del día. Más alto significa más malestar; desde 3.0 su estado inicial se marca como
        frustración.
    </>
);
