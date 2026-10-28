// GET /api/v1/alumno/actividades/:id/siguiente → ejercicio vigente o { completada, recompensa }
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { siguienteEjercicio } from "../../../../../../modules/alumno/servidor/motor";
import { respuestaSiguiente } from "../../../../../../modules/alumno/servidor/respuestas";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error } from "../../../../../../modules/shared/servidor/http";

export const GET: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const id = z.string().uuid().safeParse(ctx.params.id);
    if (!id.success) return error("NO_ENCONTRADO", "Actividad no encontrada", 404);
    return respuestaSiguiente(await conContexto(contextoDe(alumno), (tx) => siguienteEjercicio(tx, alumno.id, id.data)));
};
