// GET /api/v1/alumno/actividades → mis actividades (RF-64, EXP-04.1)
import type { APIRoute } from "astro";
import { misActividades } from "../../../../../modules/alumno/servidor/motor";
import { conContexto } from "../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, json } from "../../../../../modules/shared/servidor/http";

export const GET: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    return json({ items: await conContexto(contextoDe(alumno), (tx) => misActividades(tx, alumno.id)) });
};
