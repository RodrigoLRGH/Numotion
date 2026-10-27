// GET /api/v1/alumno/diagnostico/matematico/siguiente → pregunta pendiente o nueva, o { terminado }
import type { APIRoute } from "astro";
import { siguientePregunta } from "../../../../../../modules/alumno/servidor/diagnostico";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error, json } from "../../../../../../modules/shared/servidor/http";

export const GET: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const r = await conContexto(contextoDe(alumno), (tx) => siguientePregunta(tx, alumno.id));
    if ("error" in r) return error("CONFLICTO", "Primero cuéntanos cómo te sientes hoy", 409);
    return json(r);
};
