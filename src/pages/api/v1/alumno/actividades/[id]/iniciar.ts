// POST /api/v1/alumno/actividades/:id/iniciar → nivel del día + ejercicio vigente
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { iniciarActividad } from "../../../../../../modules/alumno/servidor/motor";
import { respuestaSiguiente } from "../../../../../../modules/alumno/servidor/respuestas";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error } from "../../../../../../modules/shared/servidor/http";

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const id = z.string().uuid().safeParse(ctx.params.id);
    if (!id.success) return error("NO_ENCONTRADO", "Actividad no encontrada", 404);
    return respuestaSiguiente(await conContexto(contextoDe(alumno), (tx) => iniciarActividad(tx, alumno.id, id.data)));
};
