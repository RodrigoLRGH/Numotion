// PUT /api/v1/alumno/diagnostico/panas/respuestas/:itemId { valor: 1..5 } → 204 (guardado incremental)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { responderPanas } from "../../../../../../../modules/alumno/servidor/diagnostico";
import { conContexto } from "../../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error, leerCuerpo } from "../../../../../../../modules/shared/servidor/http";

const Esquema = z.object({ valor: z.number().int().min(1).max(5) });

export const PUT: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const itemId = z.string().uuid().safeParse(ctx.params.itemId);
    if (!itemId.success) return error("NO_ENCONTRADO", "Pregunta no encontrada", 404);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await conContexto(contextoDe(alumno), (tx) => responderPanas(tx, alumno.id, itemId.data, datos.valor));
    switch (r) {
        case "ok":
            return new Response(null, { status: 204 });
        case "item_desconocido":
            return error("NO_ENCONTRADO", "Pregunta no encontrada", 404);
        case "completado":
            return error("CONFLICTO", "El cuestionario de hoy ya está terminado", 409);
        case "valor_invalido":
            return error("VALIDACION", "Elige una de las 5 caritas", 400);
    }
};
