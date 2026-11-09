// Insignias (RF-03, RF-66, EXP-06.1, 02-diseno/02-…§4). El catálogo vive en BD (insignia.regla);
// esta función decide qué claves merece el alumno con su contexto. Se otorgan una sola vez
// (INSERT … ON CONFLICT DO NOTHING) y sin comparaciones entre alumnos.

export type Regla =
    | { tipo: "asignaciones_completadas"; min: number }
    | { tipo: "racha"; min: number }
    | { tipo: "practicas_completadas"; min: number }
    | { tipo: "tipos_juego_distintos"; min: number }
    | { tipo: "ayuda_y_aciertos_seguidos"; aciertos: number }
    | { tipo: "maestria_tema"; temaClave: string; asignaciones: number; resultadoMin: number };

export interface InsigniaCatalogo {
    clave: string;
    regla: Regla;
}

export interface ContextoGamificacion {
    asignacionesCompletadas: number;
    rachaActual: number;
    practicasCompletadas: number;
    tiposJuegoDistintos: number;
    /** Mayor número de ejercicios acertados seguidos justo después de uno en el que pidió ayuda */
    aciertosTrasAyuda: number;
    /** Resultados finales (0–10) de asignaciones completadas, por clave de tema */
    resultadosPorTema: Readonly<Record<string, readonly number[]>>;
}

export function cumpleRegla(regla: Regla, c: ContextoGamificacion): boolean {
    switch (regla.tipo) {
        case "asignaciones_completadas":
            return c.asignacionesCompletadas >= regla.min;
        case "racha":
            return c.rachaActual >= regla.min;
        case "practicas_completadas":
            return c.practicasCompletadas >= regla.min;
        case "tipos_juego_distintos":
            return c.tiposJuegoDistintos >= regla.min;
        case "ayuda_y_aciertos_seguidos":
            return c.aciertosTrasAyuda >= regla.aciertos;
        case "maestria_tema":
            return (c.resultadosPorTema[regla.temaClave] ?? []).filter((r) => r >= regla.resultadoMin).length >= regla.asignaciones;
        default:
            return false;
    }
}

/** Claves nuevas: las que cumple y aún no tiene. Reglas desconocidas o mal formadas se ignoran. */
export function evaluarInsignias(ctx: ContextoGamificacion, catalogo: readonly InsigniaCatalogo[], obtenidas: Iterable<string> = []): string[] {
    const ya = new Set(obtenidas);
    return catalogo.filter((i) => !ya.has(i.clave) && i.regla && typeof i.regla === "object" && cumpleRegla(i.regla, ctx)).map((i) => i.clave);
}

/** Racha de aciertos más larga que empieza justo después de un ejercicio con ayuda (orden cronológico). */
export function aciertosTrasAyuda(ejercicios: readonly { ayuda: boolean; correcto: boolean }[]): number {
    let mejor = 0;
    let contando = false;
    let actual = 0;
    for (const e of ejercicios) {
        if (e.ayuda) {
            // El propio ejercicio con ayuda no cuenta; desde el siguiente se cuentan aciertos seguidos
            contando = true;
            actual = 0;
            continue;
        }
        if (!contando) continue;
        if (e.correcto) {
            actual++;
            mejor = Math.max(mejor, actual);
        } else {
            contando = false;
            actual = 0;
        }
    }
    return mejor;
}
