// Mensaje motivacional al entrar al panel (RF-22, EXP-06.5). El catálogo vive en BD
// (mensaje_motivacional.condicion); aquí se elige uno según la identidad del alumno (nombre), su
// historial académico (actividades completadas, último resultado, temas fuertes y por reforzar del
// diagnóstico), el estado inicial del día y la racha; estable durante el día y sin repetir el de ayer.
import { semillaDeTexto } from "./aleatorio";

export interface CondicionMensaje {
    /** Estados iniciales (retroalimentación del día) en los que aplica; vacío o ausente = todos */
    estadoInicial?: readonly string[];
    /** Racha mínima para mostrarlo */
    rachaMin?: number;
    /** Racha máxima (p. ej. 0 para "empieza una nueva racha") */
    rachaMax?: number;
    /** Historial académico (RF-22): actividades asignadas completadas */
    actividadesMin?: number;
    actividadesMax?: number;
    /** Resultado (0–10) de la última actividad completada */
    resultadoMin?: number;
    resultadoMax?: number;
    /** Requiere un tema con dominio alto (≥ 4) en el diagnóstico más reciente: {tema_fuerte} */
    conTemaFuerte?: boolean;
    /** Requiere un tema con dominio bajo (≤ 2) en el diagnóstico más reciente: {tema_reto} */
    conTemaReto?: boolean;
}

/** Historial académico del alumno para personalizar el mensaje (RF-22). */
export interface HistorialAcademico {
    actividadesCompletadas: number;
    /** Última actividad completada: resultado 0–10 y tema */
    ultimoResultado: number | null;
    ultimoTema: string | null;
    /** Tema con mayor dominio (≥ 4) y con menor dominio (≤ 2) del diagnóstico más reciente */
    temaFuerte: string | null;
    temaReto: string | null;
}

export interface MensajeCatalogo {
    id: string;
    texto: string;
    condicion: CondicionMensaje;
}

export interface ContextoMensaje {
    nombre: string;
    racha: number;
    estadoInicial: string | null;
    /** YYYY-MM-DD local */
    fecha: string;
    /** Sin historial, los mensajes con condiciones académicas no aplican */
    historial?: HistorialAcademico | null;
}

export interface MensajePrevio {
    id: string;
    fecha: string;
}

export function aplica(c: CondicionMensaje, ctx: ContextoMensaje): boolean {
    if (c.estadoInicial?.length && (!ctx.estadoInicial || !c.estadoInicial.includes(ctx.estadoInicial))) return false;
    if (c.rachaMin !== undefined && ctx.racha < c.rachaMin) return false;
    if (c.rachaMax !== undefined && ctx.racha > c.rachaMax) return false;
    if (esAcademica(c)) {
        const h = ctx.historial;
        if (!h) return false;
        if (c.actividadesMin !== undefined && h.actividadesCompletadas < c.actividadesMin) return false;
        if (c.actividadesMax !== undefined && h.actividadesCompletadas > c.actividadesMax) return false;
        if (c.resultadoMin !== undefined || c.resultadoMax !== undefined) {
            if (h.ultimoResultado === null || !h.ultimoTema) return false;
            if (c.resultadoMin !== undefined && h.ultimoResultado < c.resultadoMin) return false;
            if (c.resultadoMax !== undefined && h.ultimoResultado > c.resultadoMax) return false;
        }
        if (c.conTemaFuerte && !h.temaFuerte) return false;
        if (c.conTemaReto && !h.temaReto) return false;
    }
    return true;
}

const esAcademica = (c: CondicionMensaje) =>
    c.actividadesMin !== undefined || c.actividadesMax !== undefined || c.resultadoMin !== undefined || c.resultadoMax !== undefined ||
    Boolean(c.conTemaFuerte) || Boolean(c.conTemaReto);

/** Peso de especificidad: un mensaje para la situación exacta gana a uno genérico. El historial
 *  académico pesa como el estado del día, así que ambos tipos de mensaje se alternan. */
const especificidad = (c: CondicionMensaje) =>
    (c.estadoInicial?.length ? 2 : 0) + (c.rachaMin !== undefined || c.rachaMax !== undefined ? 1 : 0) + (esAcademica(c) ? 2 : 0);

const formatoResultado = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function sustituir(texto: string, ctx: Pick<ContextoMensaje, "nombre" | "racha" | "historial">): string {
    const primerNombre = ctx.nombre.trim().split(/\s+/)[0] ?? "";
    const h = ctx.historial;
    return texto
        .replaceAll("{nombre}", primerNombre)
        .replaceAll("{racha}", String(ctx.racha))
        .replaceAll("{actividades}", String(h?.actividadesCompletadas ?? 0))
        .replaceAll("{resultado}", h?.ultimoResultado === null || h?.ultimoResultado === undefined ? "" : formatoResultado(h.ultimoResultado))
        .replaceAll("{tema}", h?.ultimoTema?.toLowerCase() ?? "")
        .replaceAll("{tema_fuerte}", h?.temaFuerte?.toLowerCase() ?? "")
        .replaceAll("{tema_reto}", h?.temaReto?.toLowerCase() ?? "");
}

/**
 * Elige el mensaje del día. Si ya se eligió uno hoy, se repite (estable al recargar). Si el de ayer
 * sigue aplicando, se evita mientras haya otra opción. null si el catálogo está vacío.
 */
export function elegirMensaje(catalogo: readonly MensajeCatalogo[], ctx: ContextoMensaje, previo: MensajePrevio | null): { id: string; texto: string } | null {
    if (previo?.fecha === ctx.fecha) {
        const mismo = catalogo.find((m) => m.id === previo.id);
        if (mismo) return { id: mismo.id, texto: sustituir(mismo.texto, ctx) };
    }
    const aplicables = catalogo.filter((m) => aplica(m.condicion ?? {}, ctx));
    if (aplicables.length === 0) return null;
    const max = Math.max(...aplicables.map((m) => especificidad(m.condicion ?? {})));
    let candidatos = aplicables.filter((m) => especificidad(m.condicion ?? {}) === max);
    // Sin repetir el de ayer: primero dentro del grupo más específico, si no, entre todos los aplicables
    if (previo) {
        const sinPrevio = candidatos.filter((m) => m.id !== previo.id);
        const sinPrevioTodos = aplicables.filter((m) => m.id !== previo.id);
        candidatos = sinPrevio.length ? sinPrevio : sinPrevioTodos.length ? sinPrevioTodos : candidatos;
    }
    const ordenados = [...candidatos].sort((a, b) => a.id.localeCompare(b.id));
    const elegido = ordenados[semillaDeTexto(`${ctx.nombre}|${ctx.fecha}`) % ordenados.length];
    return { id: elegido.id, texto: sustituir(elegido.texto, ctx) };
}
