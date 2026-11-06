// Servir el siguiente ejercicio con historia de OpenAI cuando está activo (T-03-04-20, EXP-04.7).
// Tres pasos para no tener la fila de la asignación bloqueada mientras responde OpenAI (hasta 20 s):
//   1. plan en una transacción corta (caché o pedido sin PII),
//   2. llamada a OpenAI fuera de la transacción (con presupuesto y validación),
//   3. creación del ejercicio; si algo cambió entre tanto o falló, el del catálogo.
import { aplicarHistoria } from "@numotion/core/dominio/historias";
import { conContexto, type Contexto } from "../../infra/db";
import { configOpenAI, pedirHistoria, type ConfigOpenAI, type Presupuesto } from "../../infra/openai";
import { ajustarNivelInicial, iniciarActividad, planHistoria, siguienteEjercicio, type Propuesta, type Siguiente } from "./motor";

type ContextoAlumno = NonNullable<Contexto>;

/** Presupuesto mensual en BD, cada operación en su propia transacción corta. */
export function presupuestoBd(ctx: ContextoAlumno): Presupuesto {
    return {
        async reservar(usd, limiteUsd) {
            const [fila] = await conContexto(ctx, (tx) => tx.$queryRaw<{ ok: boolean }[]>`SELECT fn_openai_reservar(${usd}::numeric, ${limiteUsd}::numeric) AS ok`);
            return fila?.ok === true;
        },
        async ajustar(deltaUsd) {
            await conContexto(ctx, (tx) => tx.$executeRaw`SELECT fn_openai_ajustar(${deltaUsd}::numeric)`);
        },
    };
}

export interface Dependencias {
    cfg?: ConfigOpenAI;
    fetchFn?: typeof fetch;
    presupuesto?: Presupuesto;
}

async function proponer(ctx: ContextoAlumno, asignacionId: string, iniciar: boolean, cfg: ConfigOpenAI, deps: Dependencias): Promise<Propuesta | null> {
    const plan = await conContexto(ctx, async (tx) => {
        if (iniciar && !(await ajustarNivelInicial(tx, ctx.id, asignacionId))) return null;
        return planHistoria(tx, ctx.id, asignacionId);
    });
    if (!plan) return null;
    if ("reusarId" in plan) return plan;
    const r = await pedirHistoria(plan.pedido, deps.presupuesto ?? presupuestoBd(ctx), cfg, deps.fetchFn);
    if (!r.ok) return null;
    return { nivel: plan.nivel, presentados: plan.presentados, ejercicio: aplicarHistoria(plan.ejercicio, r.historia), contexto: plan.pedido.interes };
}

/** POST …/iniciar (iniciar = true) y GET …/siguiente. Sin OpenAI activo es exactamente el motor de siempre. */
export async function servirEjercicio(ctx: ContextoAlumno, asignacionId: string, iniciar: boolean, deps: Dependencias = {}): Promise<Siguiente> {
    const cfg = deps.cfg ?? configOpenAI();
    let propuesta: Propuesta | null = null;
    if (cfg.activo) {
        try {
            propuesta = await proponer(ctx, asignacionId, iniciar, cfg, deps);
        } catch (e) {
            // La historia es opcional: cualquier fallo cae al catálogo (ADR-007)
            console.warn(`[openai] sin historia (plan): ${e instanceof Error ? e.name : "Error"}; se usa el catálogo`);
        }
    }
    return conContexto(ctx, (tx) =>
        iniciar ? iniciarActividad(tx, ctx.id, asignacionId, propuesta) : siguienteEjercicio(tx, ctx.id, asignacionId, propuesta),
    );
}
