// POST /api/v1/alumno/intentos → califica, avanza la asignación, ajusta el nivel (05-contratos §3.3).
// Idempotente por clienteId: un reintento devuelve la misma respuesta.
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { registrarIntento } from "../../../../modules/alumno/servidor/motor";
import { errorIntento } from "../../../../modules/alumno/servidor/respuestas";
import { conContexto } from "../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, json, leerCuerpo } from "../../../../modules/shared/servidor/http";

const Esquema = z.object({
    clienteId: z.string().uuid(),
    asignacionId: z.string().uuid(),
    ejercicioId: z.string().uuid(),
    respuesta: z.string().trim().min(1).max(200),
    tiempoMs: z.number().int().min(0).max(30 * 60_000),
    ayudaSolicitada: z.boolean().default(false),
});

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await conContexto(contextoDe(alumno), (tx) => registrarIntento(tx, alumno.id, datos));
    return "error" in r ? errorIntento(r.error) : json(r, 201);
};
