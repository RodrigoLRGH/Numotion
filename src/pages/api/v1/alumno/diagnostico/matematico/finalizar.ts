// POST /api/v1/alumno/diagnostico/matematico/finalizar → dominio por tema + retroalimentación (RF-61)
import type { APIRoute } from "astro";
import { finalizarMatematico } from "../../../../../../modules/alumno/servidor/diagnostico";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { alumnoDe, contextoDe, error, json } from "../../../../../../modules/shared/servidor/http";

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const r = await conContexto(contextoDe(alumno), (tx) => finalizarMatematico(tx, alumno.id));
    if (r.ok) return json({ dominio: r.dominio, retroalimentacionId: r.retroalimentacionId });
    return r.motivo === "panas_pendiente"
        ? error("CONFLICTO", "Primero cuéntanos cómo te sientes hoy", 409)
        : error("VALIDACION", "Aún faltan preguntas por responder", 422);
};
