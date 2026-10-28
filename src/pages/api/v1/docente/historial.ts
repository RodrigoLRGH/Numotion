// GET /api/v1/docente/historial?alumnoId=&temaId=&grupoId=&desde=&hasta=&cursor= (RF-59)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { historial } from "../../../../modules/docente/servidor/actividades";
import { Fecha } from "../../../../modules/docente/servidor/esquemas";
import { conContexto } from "../../../../modules/shared/servidor/db";
import { contextoDe, docenteDe, error, json } from "../../../../modules/shared/servidor/http";

const Filtros = z.object({
    alumnoId: z.string().uuid().optional(),
    temaId: z.string().uuid().optional(),
    grupoId: z.string().uuid().optional(),
    desde: Fecha.optional(),
    hasta: Fecha.optional(),
    cursor: z.string().max(200).optional(),
});

export const GET: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    // Los filtros vacíos del formulario llegan como "": se ignoran
    const crudo = Object.fromEntries([...ctx.url.searchParams].filter(([, v]) => v !== ""));
    const f = Filtros.safeParse(crudo);
    if (!f.success) return error("VALIDACION", "Filtros inválidos", 400, f.error.issues);
    return json(await conContexto(contextoDe(docente), (tx) => historial(tx, f.data)));
};
