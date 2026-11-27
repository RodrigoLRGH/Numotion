// Descripción de la retroalimentación de un diagnóstico para el docente (RF-62, pantalla
// "Retroalimentaciones"): tiempo, temas y aspectos detectados al resolver. Lenguaje de señales
// observadas, nunca de diagnóstico clínico (EXP-07, Lenguaje).

export interface TemaDiagnostico {
    tema: string;
    ejercicios: number;
    aciertos: number;
    /** 1..5 */
    nivelDominio: number;
    tiempoMs: number;
}

export interface EntradaDescripcion {
    temas: readonly TemaDiagnostico[];
    estadoInicial: string | null;
    afectoPositivo: number | null;
    afectoNegativo: number | null;
    observaciones: readonly string[];
}

const ESTADO_TEXTO: Record<string, string> = {
    positivo: "con ánimo positivo",
    neutral: "con ánimo neutral",
    frustracion: "con señales de frustración",
    desinteres: "con señales de desinterés",
};

/** 390000 → "6 min 30 s"; 45000 → "45 s". */
export function duracion(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    const min = Math.floor(s / 60);
    const seg = s % 60;
    if (min === 0) return `${seg} s`;
    return seg ? `${min} min ${seg} s` : `${min} min`;
}

const lista = (v: readonly string[]) => (v.length <= 1 ? v.join("") : `${v.slice(0, -1).join(", ")} y ${v[v.length - 1]}`);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const decimal = (v: number) => v.toFixed(1);

/** Párrafos de la descripción: tiempo, temas y aspectos emocionales detectados. */
export function describirDiagnostico(e: EntradaDescripcion): string[] {
    const parrafos: string[] = [];

    if (e.temas.length === 0) {
        parrafos.push("No hay resultados del diagnóstico matemático de este día.");
    } else {
        const ejercicios = e.temas.reduce((s, t) => s + t.ejercicios, 0);
        const tiempo = e.temas.reduce((s, t) => s + t.tiempoMs, 0);
        parrafos.push(
            `Resolvió el diagnóstico matemático en ${duracion(tiempo)}: ${plural(ejercicios, "ejercicio", "ejercicios")} de ${plural(e.temas.length, "tema", "temas")} (${lista(e.temas.map((t) => t.tema))}).`,
        );
        const max = Math.max(...e.temas.map((t) => t.nivelDominio));
        const min = Math.min(...e.temas.map((t) => t.nivelDominio));
        if (max === min) {
            parrafos.push(`Mostró un nivel parecido en ${e.temas.length === 1 ? "el tema" : "todos los temas"} (nivel ${max} de 5).`);
        } else {
            const fuertes = e.temas.filter((t) => t.nivelDominio === max).map((t) => t.tema);
            const debiles = e.temas.filter((t) => t.nivelDominio === min).map((t) => t.tema);
            parrafos.push(
                `Su mejor desempeño fue en ${lista(fuertes)} (nivel ${max} de 5)` +
                    (min <= 2 ? `; conviene reforzar ${lista(debiles)} (nivel ${min} de 5).` : `; el más bajo fue ${lista(debiles)} (nivel ${min} de 5).`),
            );
        }
        const lento = [...e.temas].sort((a, b) => b.tiempoMs / Math.max(1, b.ejercicios) - a.tiempoMs / Math.max(1, a.ejercicios))[0];
        if (e.temas.length > 1 && lento.ejercicios > 0) {
            parrafos.push(`El tema en el que más tardó por ejercicio fue ${lento.tema} (${duracion(lento.tiempoMs / lento.ejercicios)} en promedio).`);
        }
    }

    if (e.afectoPositivo !== null && e.afectoNegativo !== null) {
        const estado = e.estadoInicial ? ESTADO_TEXTO[e.estadoInicial] : undefined;
        parrafos.push(
            `En el cuestionario emocional (PANAS-C) inició el día${estado ? ` ${estado}` : ""}: afecto positivo ${decimal(e.afectoPositivo)} y afecto negativo ${decimal(e.afectoNegativo)} (escala de 1 a 5).`,
        );
    } else {
        parrafos.push("No hay resultado del cuestionario emocional (PANAS-C) de este día.");
    }

    if (e.observaciones.length) parrafos.push(`Aspectos detectados: ${e.observaciones.join("; ")}.`);
    return parrafos;
}
