import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { iniciarPractica } from "../../../modules/alumno/servidor/panel";
import { alumnoDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({ tema: z.string().max(40) });

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const id = await iniciarPractica(alumno.idAlumno, datos.tema);
    if (!id) return error("Tema no encontrado", 404);
    return json({ ok: true, destino: `/alumno/practica/${id}` });
};
