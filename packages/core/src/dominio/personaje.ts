// Personaje del alumno (RF-03, RF-65): su avatar de acceso con accesorios que se desbloquean al
// subir de nivel de gamificación (02-…§4: "cada nivel desbloquea un accesorio del personaje").
import { AVATARES } from "./acceso";
import { NIVEL_GAMIFICACION_MAX, puntosParaNivel } from "./puntos";

export interface Accesorio {
    nivel: number;
    emoji: string;
    nombre: string;
}

export const ACCESORIOS: readonly Accesorio[] = [
    { nivel: 2, emoji: "🧢", nombre: "Gorra" },
    { nivel: 3, emoji: "🎩", nombre: "Sombrero" },
    { nivel: 4, emoji: "🕶️", nombre: "Lentes de sol" },
    { nivel: 5, emoji: "🎒", nombre: "Mochila" },
    { nivel: 6, emoji: "🧣", nombre: "Bufanda" },
    { nivel: 7, emoji: "🎨", nombre: "Pincel mágico" },
    { nivel: 8, emoji: "🔭", nombre: "Telescopio" },
    { nivel: 9, emoji: "🪁", nombre: "Papalote" },
    { nivel: 10, emoji: "🦸", nombre: "Capa de héroe" },
    { nivel: 11, emoji: "🎸", nombre: "Guitarra" },
    { nivel: 12, emoji: "🚲", nombre: "Bicicleta" },
    { nivel: 13, emoji: "🛹", nombre: "Patineta" },
    { nivel: 14, emoji: "🧭", nombre: "Brújula" },
    { nivel: 15, emoji: "🪄", nombre: "Varita" },
    { nivel: 16, emoji: "🚀", nombre: "Cohete" },
    { nivel: 17, emoji: "🌈", nombre: "Arcoíris" },
    { nivel: 18, emoji: "💎", nombre: "Gema" },
    { nivel: 19, emoji: "🏅", nombre: "Medalla de oro" },
    { nivel: 20, emoji: "👑", nombre: "Corona" },
];

export interface Personaje {
    emoji: string;
    nombre: string;
    accesorios: Accesorio[];
    /** El accesorio más reciente (se luce junto al personaje) */
    accesorioActual: Accesorio | null;
}

export function personajeDe(avatar: string, nivel: number): Personaje {
    const a = AVATARES.find((x) => x.id === avatar);
    const accesorios = ACCESORIOS.filter((x) => x.nivel <= nivel);
    return { emoji: a?.emoji ?? "🙂", nombre: a?.nombre ?? "explorador", accesorios, accesorioActual: accesorios.at(-1) ?? null };
}

export interface ProgresoNivel {
    nivel: number;
    puntos: number;
    puntosNivel: number;
    /** null en el nivel máximo */
    puntosSiguienteNivel: number | null;
    /** 0–100 */
    porcentaje: number;
}

export function progresoNivel(puntos: number, nivel: number): ProgresoNivel {
    const base = puntosParaNivel(nivel);
    const siguiente = nivel >= NIVEL_GAMIFICACION_MAX ? null : puntosParaNivel(nivel + 1);
    const porcentaje = siguiente === null ? 100 : Math.max(0, Math.min(100, Math.round(((puntos - base) / (siguiente - base)) * 100)));
    return { nivel, puntos, puntosNivel: base, puntosSiguienteNivel: siguiente, porcentaje };
}

/** Días hábiles (L–V) de la semana de `hoy` (YYYY-MM-DD), para la representación visual de la racha. */
export function semanaHabil(hoy: string): string[] {
    const [y, m, d] = hoy.split("-").map(Number);
    const fecha = new Date(Date.UTC(y, m - 1, d));
    const dia = fecha.getUTCDay(); // 0 domingo … 6 sábado
    // Sábado y domingo muestran la semana que termina; lunes a viernes, la semana en curso
    const desdeLunes = dia === 0 ? 6 : dia - 1;
    fecha.setUTCDate(fecha.getUTCDate() - desdeLunes);
    return Array.from({ length: 5 }, (_, i) => {
        const f = new Date(fecha);
        f.setUTCDate(fecha.getUTCDate() + i);
        return f.toISOString().slice(0, 10);
    });
}
