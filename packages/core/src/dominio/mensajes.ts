// Mensaje motivacional al entrar al panel (RF-22, EXP-06.5). El catálogo vive en BD
// (mensaje_motivacional.condicion); aquí se elige uno según el estado inicial del día y la racha,
// estable durante el día y sin repetir el del día anterior.
import { semillaDeTexto } from "./aleatorio";

export interface CondicionMensaje {
    /** Estados iniciales (retroalimentación del día) en los que aplica; vacío o ausente = todos */
    estadoInicial?: readonly string[];
    /** Racha mínima para mostrarlo */
    rachaMin?: number;
    /** Racha máxima (p. ej. 0 para "empieza una nueva racha") */
    rachaMax?: number;
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
}

export interface MensajePrevio {
    id: string;
    fecha: string;
}

export function aplica(c: CondicionMensaje, ctx: ContextoMensaje): boolean {
    if (c.estadoInicial?.length && (!ctx.estadoInicial || !c.estadoInicial.includes(ctx.estadoInicial))) return false;
    if (c.rachaMin !== undefined && ctx.racha < c.rachaMin) return false;
    if (c.rachaMax !== undefined && ctx.racha > c.rachaMax) return false;
    return true;
}

/** Peso de especificidad: un mensaje para la situación exacta gana a uno genérico. */
const especificidad = (c: CondicionMensaje) => (c.estadoInicial?.length ? 2 : 0) + (c.rachaMin !== undefined || c.rachaMax !== undefined ? 1 : 0);

export function sustituir(texto: string, ctx: Pick<ContextoMensaje, "nombre" | "racha">): string {
    const primerNombre = ctx.nombre.trim().split(/\s+/)[0] ?? "";
    return texto.replaceAll("{nombre}", primerNombre).replaceAll("{racha}", String(ctx.racha));
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
