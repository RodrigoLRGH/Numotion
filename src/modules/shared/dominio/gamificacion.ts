// Gamificación (RF-03, RF-65, RF-66): puntos, niveles con personaje e insignias.
// Sin rankings ni comparaciones entre alumnos.

export function puntosPorRespuesta(nivel: number, numeroIntento: number): number {
    if (numeroIntento <= 1) return 10 * nivel;
    if (numeroIntento === 2) return 5 * nivel;
    return 2 * nivel;
}

export interface NivelGamificacion {
    nivel: number;
    personaje: string;
    nombre: string;
    puntosMinimos: number;
}

export const NIVELES_GAMIFICACION: readonly NivelGamificacion[] = [
    { nivel: 1, personaje: "🐣", nombre: "Pollito curioso", puntosMinimos: 0 },
    { nivel: 2, personaje: "🐥", nombre: "Pollito valiente", puntosMinimos: 100 },
    { nivel: 3, personaje: "🦊", nombre: "Zorro astuto", puntosMinimos: 300 },
    { nivel: 4, personaje: "🦉", nombre: "Búho sabio", puntosMinimos: 700 },
    { nivel: 5, personaje: "🐬", nombre: "Delfín genial", puntosMinimos: 1500 },
    { nivel: 6, personaje: "🐉", nombre: "Dragón matemático", puntosMinimos: 3000 },
];

export function nivelGamificacion(puntos: number): NivelGamificacion & { siguiente: NivelGamificacion | null; progreso: number } {
    let actual = NIVELES_GAMIFICACION[0];
    for (const n of NIVELES_GAMIFICACION) if (puntos >= n.puntosMinimos) actual = n;
    const siguiente = NIVELES_GAMIFICACION.find((n) => n.nivel === actual.nivel + 1) ?? null;
    const progreso = siguiente
        ? Math.round(((puntos - actual.puntosMinimos) / (siguiente.puntosMinimos - actual.puntosMinimos)) * 100)
        : 100;
    return { ...actual, siguiente, progreso };
}

export interface Insignia {
    clave: string;
    nombre: string;
    descripcion: string;
    emoji: string;
}

export const INSIGNIAS: readonly Insignia[] = [
    { clave: "primera_actividad", nombre: "¡Primer paso!", descripcion: "Completaste tu primera actividad asignada", emoji: "🎯" },
    { clave: "actividad_perfecta", nombre: "Perfecto", descripcion: "Completaste una actividad sin errores", emoji: "💯" },
    { clave: "practica_5", nombre: "Practicón", descripcion: "Completaste 5 prácticas libres", emoji: "🎮" },
    { clave: "racha_3", nombre: "En llamas", descripcion: "Racha de 3 días hábiles", emoji: "🔥" },
    { clave: "racha_5", nombre: "Semana completa", descripcion: "Racha de 5 días hábiles", emoji: "🏆" },
    { clave: "nivel_5", nombre: "Cima", descripcion: "Llegaste al nivel 5 de dificultad", emoji: "⛰️" },
    { clave: "persistente", nombre: "Persistente", descripcion: "Resolviste un ejercicio después de equivocarte", emoji: "🐢" },
];

export interface ContextoInsignias {
    actividadesCompletadas: number;
    actividadPerfecta: boolean;
    practicasCompletadas: number;
    rachaActual: number;
    nivelAlcanzado: number;
    resolvioTrasError: boolean;
}

/** Claves de insignias que corresponden según el contexto (sin filtrar las ya obtenidas). */
export function insigniasMerecidas(c: ContextoInsignias): string[] {
    const claves: string[] = [];
    if (c.actividadesCompletadas >= 1) claves.push("primera_actividad");
    if (c.actividadPerfecta) claves.push("actividad_perfecta");
    if (c.practicasCompletadas >= 5) claves.push("practica_5");
    if (c.rachaActual >= 3) claves.push("racha_3");
    if (c.rachaActual >= 5) claves.push("racha_5");
    if (c.nivelAlcanzado >= 5) claves.push("nivel_5");
    if (c.resolvioTrasError) claves.push("persistente");
    return claves;
}

export function insigniaPorClave(clave: string): Insignia | undefined {
    return INSIGNIAS.find((i) => i.clave === clave);
}
