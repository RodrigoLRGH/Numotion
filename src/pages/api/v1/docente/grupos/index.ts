// GET/POST /api/v1/docente/grupos (05-contratos §4.1)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { crearGrupo, gruposDelDocente } from "../../../../../modules/docente/servidor/grupos";
import { conContexto } from "../../../../../modules/shared/servidor/db";
import { contextoDe, docenteDe, json, leerCuerpo } from "../../../../../modules/shared/servidor/http";

const Esquema = z.object({
    nombre: z.string().trim().min(1).max(40),
    grado: z.number().int().min(1).max(6),
    cicloEscolar: z.string().trim().regex(/^\d{4}-\d{4}$/, "formato 2026-2027"),
});

export const GET: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    return json({ items: await conContexto(contextoDe(docente), gruposDelDocente) });
};

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const grupo = await conContexto(contextoDe(docente), (tx) => crearGrupo(tx, docente.id, datos));
    return json(grupo, 201);
};
