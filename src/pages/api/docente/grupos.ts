import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { crearGrupo } from "../../../modules/docente/servidor/grupos";
import { docenteDe, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    nombre: z.string().trim().min(1).max(40),
    grado: z.number().int().min(1).max(6),
    ciclo: z.string().trim().min(4).max(20),
});

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const grupo = await crearGrupo(docente.id, datos);
    return json({ ok: true, grupo }, 201);
};
