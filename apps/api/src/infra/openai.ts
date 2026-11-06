// ContentGateway de OpenAI (T-03-04-20, EXP-04.7, ADR-007, RI-07). Pide a OpenAI el texto de un
// problema con historia y lo valida; ante cualquier fallo (sin clave, presupuesto agotado, error HTTP,
// timeout o respuesta inválida) devuelve null y el motor usa el ejercicio del catálogo.
// Nunca lanza: la generación es un enriquecimiento opcional.
import {
    costoMaximoUsd,
    costoUsd,
    historiaSimulada,
    mensajesHistoria,
    validarHistoria,
    type Historia,
    type PedidoHistoria,
    type Precios,
} from "@numotion/core/dominio/historias";

export interface ConfigOpenAI {
    activo: boolean;
    /** real: API de OpenAI · mock: historia determinista sin red (desarrollo, CI y E2E). */
    modo: "real" | "mock";
    apiKey: string | undefined;
    modelo: string;
    baseUrl: string;
    timeoutMs: number;
    presupuestoUsd: number;
    precios: Precios;
    maxTokensSalida: number;
}

const numero = (v: string | undefined, porDefecto: number): number => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : porDefecto;
};

/** Configuración desde el entorno (ver .env.example). Se lee en cada uso para que las pruebas la cambien. */
export function configOpenAI(env: NodeJS.ProcessEnv = process.env): ConfigOpenAI {
    const modo = env.OPENAI_MODE === "mock" ? "mock" : "real";
    const apiKey = env.OPENAI_API_KEY?.trim() || undefined;
    return {
        // En modo real sin clave queda apagado: el sistema funciona completo sin OpenAI
        activo: env.OPENAI_ENABLED === "true" && (modo === "mock" || Boolean(apiKey)),
        modo,
        apiKey,
        modelo: env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        baseUrl: (env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
        timeoutMs: numero(env.OPENAI_TIMEOUT_MS, 20_000),
        presupuestoUsd: numero(env.OPENAI_MONTHLY_BUDGET_USD, 5),
        precios: { entrada: numero(env.OPENAI_PRECIO_ENTRADA_1M, 0.15), salida: numero(env.OPENAI_PRECIO_SALIDA_1M, 0.6) },
        maxTokensSalida: numero(env.OPENAI_MAX_TOKENS, 300),
    };
}

/** Control del gasto mensual (en BD: fn_openai_reservar / fn_openai_ajustar). */
export interface Presupuesto {
    reservar(usd: number, limiteUsd: number): Promise<boolean>;
    ajustar(deltaUsd: number): Promise<void>;
}

export type MotivoFallo = "presupuesto" | "http" | "timeout" | "red" | "formato" | "invalida";

export type ResultadoHistoria = { ok: true; historia: Historia; costoUsd: number } | { ok: false; motivo: MotivoFallo };

interface RespuestaChat {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Registro sin PII: solo el motivo y el modelo (P-SEC-06). */
function registrar(motivo: MotivoFallo, cfg: ConfigOpenAI, detalle = ""): void {
    console.warn(`[openai] sin historia (${motivo}) modelo=${cfg.modelo}${detalle ? ` ${detalle}` : ""}; se usa el catálogo`);
}

export async function pedirHistoria(
    pedido: PedidoHistoria,
    presupuesto: Presupuesto,
    cfg: ConfigOpenAI = configOpenAI(),
    fetchFn: typeof fetch = fetch,
): Promise<ResultadoHistoria> {
    if (cfg.modo === "mock") {
        const historia = validarHistoria(historiaSimulada(pedido), pedido);
        return historia ? { ok: true, historia, costoUsd: 0 } : { ok: false, motivo: "invalida" };
    }

    const mensajes = mensajesHistoria(pedido);
    const reserva = costoMaximoUsd(mensajes, cfg.maxTokensSalida, cfg.precios);
    try {
        if (!(await presupuesto.reservar(reserva, cfg.presupuestoUsd))) {
            registrar("presupuesto", cfg);
            return { ok: false, motivo: "presupuesto" };
        }
    } catch {
        registrar("presupuesto", cfg, "error al reservar");
        return { ok: false, motivo: "presupuesto" };
    }

    // Lo que se gastó de verdad; si no se sabe (timeout, red) se queda la reserva completa
    let gastado = reserva;
    let resultado: ResultadoHistoria;
    try {
        const r = await fetchFn(`${cfg.baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({
                model: cfg.modelo,
                messages: mensajes,
                response_format: { type: "json_object" },
                max_completion_tokens: cfg.maxTokensSalida,
                n: 1,
            }),
            signal: AbortSignal.timeout(cfg.timeoutMs),
        });
        if (!r.ok) {
            // Una petición rechazada (401, 429, 400…) no consume tokens
            gastado = 0;
            registrar("http", cfg, `status=${r.status}`);
            resultado = { ok: false, motivo: "http" };
        } else {
            const cuerpo = (await r.json()) as RespuestaChat;
            if (cuerpo.usage?.prompt_tokens !== undefined) {
                gastado = costoUsd(cuerpo.usage.prompt_tokens, cuerpo.usage.completion_tokens ?? 0, cfg.precios);
            }
            let crudo: unknown = null;
            try {
                crudo = JSON.parse(cuerpo.choices?.[0]?.message?.content ?? "");
            } catch {
                crudo = null;
            }
            const historia = crudo === null ? null : validarHistoria(crudo, pedido);
            if (crudo === null) registrar("formato", cfg);
            else if (!historia) registrar("invalida", cfg);
            resultado = historia ? { ok: true, historia, costoUsd: gastado } : { ok: false, motivo: crudo === null ? "formato" : "invalida" };
        }
    } catch (e) {
        const timeout = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
        registrar(timeout ? "timeout" : "red", cfg);
        resultado = { ok: false, motivo: timeout ? "timeout" : "red" };
    }

    if (gastado !== reserva) {
        try {
            await presupuesto.ajustar(gastado - reserva);
        } catch {
            // Si no se pudo ajustar queda la reserva (cota superior): el error es a favor del presupuesto
        }
    }
    return resultado;
}
