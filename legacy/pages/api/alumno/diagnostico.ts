import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { registrarDiagnostico } from "../../../modules/alumno/servidor/diagnostico";
import { fechaLocal } from "../../../modules/shared/dominio/fechas";
import { alumnoDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    respuestas: z
        .array(z.object({ indice: z.number().int().min(0), respuesta: z.string().max(50), tiempo_ms: z.number().min(0) }))
        .max(50),
});

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await registrarDiagnostico(alumno.idAlumno, fechaLocal(), datos.respuestas);
    if (!r.ok) return error(r.error, 409);
    return json({ ok: true, aciertos: r.resultado.aciertos, total: r.resultado.total, destino: "/alumno" });
};
