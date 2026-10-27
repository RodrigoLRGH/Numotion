// GET /api/v1/alumno/diagnostico/panas → ítems, escala y respondidos (05-contratos §3.1)
import type { APIRoute } from "astro";
import { panasDelDia } from "../../../../../../modules/alumno/servidor/diagnostico";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, json } from "../../../../../../modules/shared/servidor/http";

export const GET: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    return json(await conContexto(contextoDe(alumno), (tx) => panasDelDia(tx, alumno.id)));
};
