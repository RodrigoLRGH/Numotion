// POST /api/v1/alumno/diagnostico/matematico/respuestas → { correcta } sin revelar la respuesta
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { responderPregunta } from "../../../../../../modules/alumno/servidor/diagnostico";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error, json, leerCuerpo } from "../../../../../../modules/shared/servidor/http";

const Esquema = z.object({
    preguntaId: z.string().uuid(),
    respuesta: z.string().trim().min(1).max(200),
    tiempoMs: z.number().min(0).max(30 * 60_000),
});

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await conContexto(contextoDe(alumno), (tx) =>
        responderPregunta(tx, alumno.id, datos.preguntaId, datos.respuesta, datos.tiempoMs));
    return r ? json(r) : error("NO_ENCONTRADO", "Esa pregunta ya no está pendiente", 404);
};
