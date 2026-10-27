// PANAS-C forma breve (10 reactivos; Ebesutani et al., 2012) adaptada al español
// para primaria. Escala Likert 1..5 → cada subescala suma entre 5 y 25.

export type Subescala = "positivo" | "negativo";

export interface ReactivoPanas {
    id: number;
    afecto: string;
    pregunta: string;
    emoji: string;
    subescala: Subescala;
}

export const REACTIVOS_PANAS: readonly ReactivoPanas[] = [
    { id: 1, afecto: "alegre", pregunta: "¿Qué tan alegre te sientes hoy?", emoji: "😄", subescala: "positivo" },
    { id: 2, afecto: "triste", pregunta: "¿Qué tan triste te sientes hoy?", emoji: "😢", subescala: "negativo" },
    { id: 3, afecto: "animado", pregunta: "¿Qué tan animado(a) te sientes hoy?", emoji: "🤩", subescala: "positivo" },
    { id: 4, afecto: "asustado", pregunta: "¿Qué tan asustado(a) te sientes hoy?", emoji: "😨", subescala: "negativo" },
    { id: 5, afecto: "feliz", pregunta: "¿Qué tan feliz te sientes hoy?", emoji: "😊", subescala: "positivo" },
    { id: 6, afecto: "enojado", pregunta: "¿Qué tan enojado(a) te sientes hoy?", emoji: "😠", subescala: "negativo" },
    { id: 7, afecto: "orgulloso", pregunta: "¿Qué tan orgulloso(a) de ti te sientes hoy?", emoji: "🦸", subescala: "positivo" },
    { id: 8, afecto: "con miedo", pregunta: "¿Qué tanto miedo sientes hoy?", emoji: "😰", subescala: "negativo" },
    { id: 9, afecto: "con energía", pregunta: "¿Qué tanta energía tienes hoy?", emoji: "⚡", subescala: "positivo" },
    { id: 10, afecto: "decaído", pregunta: "¿Qué tan decaído(a) o desanimado(a) te sientes hoy?", emoji: "😞", subescala: "negativo" },
];

export const ESCALA_PANAS = [
    { valor: 1, texto: "Nada", emoji: "⚪" },
    { valor: 2, texto: "Un poco", emoji: "🔵" },
    { valor: 3, texto: "Más o menos", emoji: "🟢" },
    { valor: 4, texto: "Bastante", emoji: "🟡" },
    { valor: 5, texto: "Muchísimo", emoji: "🟠" },
] as const;

export interface RespuestaPanas {
    id: number;
    valor: number;
}

export interface PuntajePanas {
    afecto_positivo: number;
    afecto_negativo: number;
}

export type BalancePanas = "positivo" | "equilibrado" | "negativo";

export function validarRespuestasPanas(respuestas: readonly RespuestaPanas[]): string | null {
    const ids = new Set(respuestas.map((r) => r.id));
    if (ids.size !== REACTIVOS_PANAS.length || respuestas.length !== REACTIVOS_PANAS.length) {
        return "Responde todas las preguntas.";
    }
    for (const r of respuestas) {
        if (!REACTIVOS_PANAS.some((x) => x.id === r.id)) return "Pregunta desconocida.";
        if (!Number.isInteger(r.valor) || r.valor < 1 || r.valor > 5) return "Valor fuera de escala.";
    }
    return null;
}

export function calcularPanas(respuestas: readonly RespuestaPanas[]): PuntajePanas {
    let afecto_positivo = 0;
    let afecto_negativo = 0;
    for (const r of respuestas) {
        const reactivo = REACTIVOS_PANAS.find((x) => x.id === r.id);
        if (!reactivo) continue;
        if (reactivo.subescala === "positivo") afecto_positivo += r.valor;
        else afecto_negativo += r.valor;
    }
    return { afecto_positivo, afecto_negativo };
}

/** Diferencia de al menos 4 puntos (de 20 posibles) para considerar un balance no equilibrado. */
export function balancePanas(p: PuntajePanas): BalancePanas {
    const diferencia = p.afecto_positivo - p.afecto_negativo;
    if (diferencia >= 4) return "positivo";
    if (diferencia <= -4) return "negativo";
    return "equilibrado";
}
