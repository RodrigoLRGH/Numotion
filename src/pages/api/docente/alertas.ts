import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { marcarAlertaAtendida } from "../../../modules/docente/servidor/reportes";
import { docenteDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({ id: z.number().int().positive() });

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    return (await marcarAlertaAtendida(docente.id, datos.id)) ? json({ ok: true }) : error("Alerta no encontrada", 404);
};
