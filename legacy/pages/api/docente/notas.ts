import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { crearNota } from "../../../modules/docente/servidor/notas";
import { docenteDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    idAlumno: z.number().int().positive(),
    texto: z.string().trim().min(1).max(500),
    etiqueta: z.string().trim().max(30).nullable().optional(),
});

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const nota = await crearNota(docente.id, datos.idAlumno, datos.texto, datos.etiqueta || null);
    return nota ? json({ ok: true, nota }, 201) : error("Alumno no encontrado", 404);
};
