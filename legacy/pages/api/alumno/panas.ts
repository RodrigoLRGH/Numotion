import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { registrarPanas } from "../../../modules/alumno/servidor/diagnostico";
import { fechaLocal } from "../../../modules/shared/dominio/fechas";
import { alumnoDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    respuestas: z.array(z.object({ id: z.number().int(), valor: z.number().int().min(1).max(5) })).max(20),
});

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await registrarPanas(alumno.idAlumno, fechaLocal(), datos.respuestas);
    if (!r.ok) return error(r.error, 409);
    return json({ ok: true, destino: "/alumno/diagnostico/matematico" });
};
