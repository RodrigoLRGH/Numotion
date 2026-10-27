// POST /api/v1/alumno/diagnostico/panas/finalizar. A-21: no devuelve AP/AN (el alumno nunca ve sus puntajes)
import type { APIRoute } from "astro";
import { finalizarPanas } from "../../../../../../modules/alumno/servidor/diagnostico";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error, json } from "../../../../../../modules/shared/servidor/http";

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const r = await conContexto(contextoDe(alumno), (tx) => finalizarPanas(tx, alumno.id));
    return r.ok ? json({ completado: true }) : error("VALIDACION", "Faltan preguntas por responder", 422, { faltan: r.faltan });
};
