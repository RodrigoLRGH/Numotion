// P-INT-02 · ContentGateway de OpenAI (RI-07, RC-04, ADR-007): sin PII en la petición, timeout,
// presupuesto, validación de la respuesta y que nunca lanza (el motor cae al catálogo).
import { afterEach, describe, expect, it, vi } from "vitest";
import { configOpenAI, pedirHistoria, type ConfigOpenAI, type Presupuesto } from "../../apps/api/src/infra/openai";
import type { PedidoHistoria } from "@numotion/core/dominio/historias";

const pedido: PedidoHistoria = { operacion: "multiplicacion", a: 6, b: 4, nivel: 2, interes: "los dinosaurios" };
const historiaOk = { historia: "Hay 6 nidos de dinosaurio con 4 huevos en cada nido.", pregunta: "¿Cuántos huevos hay en total?" };

const cfg = (extra: Partial<ConfigOpenAI> = {}): ConfigOpenAI => ({
    ...configOpenAI({ OPENAI_ENABLED: "true", OPENAI_API_KEY: "sk-prueba", OPENAI_BASE_URL: "https://stub.local/v1" }),
    ...extra,
});

function presupuesto(permite = true) {
    const movimientos: number[] = [];
    const p: Presupuesto = {
        reservar: vi.fn(async (usd: number) => {
            if (permite) movimientos.push(usd);
            return permite;
        }),
        ajustar: vi.fn(async (delta: number) => void movimientos.push(delta)),
    };
    return { p, total: () => movimientos.reduce((s, m) => s + m, 0) };
}

const respuestaChat = (contenido: unknown, usage = { prompt_tokens: 200, completion_tokens: 50 }) =>
    new Response(JSON.stringify({ choices: [{ message: { content: typeof contenido === "string" ? contenido : JSON.stringify(contenido) } }], usage }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });

afterEach(() => vi.restoreAllMocks());

describe("configuración", () => {
    it("apagado por defecto, y en modo real sin clave también", () => {
        expect(configOpenAI({}).activo).toBe(false);
        expect(configOpenAI({ OPENAI_ENABLED: "true" }).activo).toBe(false);
        expect(configOpenAI({ OPENAI_ENABLED: "true", OPENAI_API_KEY: "sk-x" }).activo).toBe(true);
        expect(configOpenAI({ OPENAI_ENABLED: "true", OPENAI_MODE: "mock" }).activo).toBe(true);
        expect(configOpenAI({}).timeoutMs).toBe(20_000);
        expect(configOpenAI({ OPENAI_MONTHLY_BUDGET_USD: "abc" }).presupuestoUsd).toBe(5);
    });
});

describe("pedirHistoria", () => {
    it("envía solo el pedido genérico, valida la respuesta y ajusta la reserva al costo real", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { p, total } = presupuesto();
        const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => respuestaChat(historiaOk));
        const r = await pedirHistoria(pedido, p, cfg(), fetchFn as typeof fetch);
        expect(r).toEqual({ ok: true, historia: historiaOk, costoUsd: (200 * 0.15 + 50 * 0.6) / 1e6 });

        const [url, init] = fetchFn.mock.calls[0];
        expect(url).toBe("https://stub.local/v1/chat/completions");
        expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer sk-prueba");
        const cuerpo = JSON.parse(init!.body as string);
        expect(Object.keys(cuerpo).sort()).toEqual(["max_completion_tokens", "messages", "model", "n", "response_format"]);
        expect(JSON.parse(cuerpo.messages[1].content)).toEqual({ tema: "los dinosaurios", operacion: expect.any(String), numeros: [6, 4], nivel: 2 });
        // El costo neto registrado es el real, no la reserva
        expect(total()).toBeCloseTo(r.ok ? r.costoUsd : -1, 10);
    });

    it("sin presupuesto no llama a OpenAI", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const fetchFn = vi.fn();
        expect(await pedirHistoria(pedido, presupuesto(false).p, cfg(), fetchFn as unknown as typeof fetch)).toEqual({ ok: false, motivo: "presupuesto" });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("timeout → null a tiempo y la reserva se queda (cota superior)", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { p, total } = presupuesto();
        const colgado = (_u: unknown, init?: RequestInit) =>
            new Promise<Response>((_res, rej) => init!.signal!.addEventListener("abort", () => rej(init!.signal!.reason)));
        const inicio = Date.now();
        expect(await pedirHistoria(pedido, p, cfg({ timeoutMs: 50 }), colgado as typeof fetch)).toEqual({ ok: false, motivo: "timeout" });
        expect(Date.now() - inicio).toBeLessThan(2000);
        expect(p.ajustar).not.toHaveBeenCalled();
        expect(total()).toBeGreaterThan(0);
    });

    it("error HTTP → null y se devuelve la reserva", async () => {
        const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { p, total } = presupuesto();
        const r = await pedirHistoria(pedido, p, cfg(), (async () => new Response("{}", { status: 429 })) as typeof fetch);
        expect(r).toEqual({ ok: false, motivo: "http" });
        expect(total()).toBeCloseTo(0, 12);
        // P-SEC-06: el registro no lleva el pedido
        expect(aviso.mock.calls.flat().join(" ")).not.toContain("dinosaurios");
    });

    it.each([
        ["JSON roto", "no es json", "formato"],
        ["historia con el resultado", { ...historiaOk, pregunta: "¿Son 24 huevos?" }, "invalida"],
    ])("respuesta inválida (%s) → null, pero se cobra lo gastado", async (_c, contenido, motivo) => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const { p, total } = presupuesto();
        expect(await pedirHistoria(pedido, p, cfg(), (async () => respuestaChat(contenido)) as typeof fetch)).toEqual({ ok: false, motivo });
        expect(total()).toBeCloseTo((200 * 0.15 + 50 * 0.6) / 1e6, 10);
    });

    it("error de red → null sin lanzar", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const r = await pedirHistoria(pedido, presupuesto().p, cfg(), (async () => { throw new TypeError("fetch failed"); }) as typeof fetch);
        expect(r).toEqual({ ok: false, motivo: "red" });
    });

    it("modo mock: historia válida sin red ni presupuesto", async () => {
        const fetchFn = vi.fn();
        const { p } = presupuesto();
        const r = await pedirHistoria(pedido, p, cfg({ modo: "mock" }), fetchFn as unknown as typeof fetch);
        expect(r.ok).toBe(true);
        expect(fetchFn).not.toHaveBeenCalled();
        expect(p.reservar).not.toHaveBeenCalled();
    });
});
