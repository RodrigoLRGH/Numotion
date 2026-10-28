// POST /api/v1/alumno/ejercicios/:id/guia { asignacionId } → guía paso a paso (RF-11).
// POST y no GET: abrir la guía cambia los puntos del ejercicio (tras guía = 3).
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { pedirGuia } from "../../../../../../modules/alumno/servidor/motor";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error, json, leerCuerpo } from "../../../../../../modules/shared/servidor/http";

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const id = z.string().uuid().safeParse(ctx.params.id);
    const datos = await leerCuerpo(ctx.request, z.object({ asignacionId: z.string().uuid() }));
    if (datos instanceof Response) return datos;
    const guia = id.success ? await conContexto(contextoDe(alumno), (tx) => pedirGuia(tx, alumno.id, datos.asignacionId, id.data)) : null;
    return guia ? json(guia) : error("NO_ENCONTRADO", "Ese ejercicio ya no está activo", 404);
};
