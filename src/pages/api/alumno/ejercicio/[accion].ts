// POST /api/alumno/ejercicio/{siguiente|responder|guia}
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { pedirGuia, responder, siguienteEjercicio } from "../../../../modules/alumno/servidor/motor-ejercicios";
import { alumnoDe, error, json, leerCuerpo } from "../../../../modules/shared/servidor/http";

const Contexto = z.object({ tipo: z.enum(["asignacion", "practica"]), id: z.number().int().positive() });
const EsquemaBase = z.object({ contexto: Contexto });
const EsquemaResponder = z.object({
    contexto: Contexto,
    respuesta: z.string().trim().min(1).max(200),
    tiempo_ms: z.number().min(0),
});

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    switch (ctx.params.accion) {
        case "siguiente": {
            const datos = await leerCuerpo(ctx.request, EsquemaBase);
            if (datos instanceof Response) return datos;
            const r = await siguienteEjercicio(alumno.idAlumno, datos.contexto);
            return r ? json(r) : error("Actividad no encontrada", 404);
        }
        case "responder": {
            const datos = await leerCuerpo(ctx.request, EsquemaResponder);
            if (datos instanceof Response) return datos;
            const r = await responder(alumno.idAlumno, datos.contexto, datos.respuesta, datos.tiempo_ms);
            return "error" in r ? error(r.error, r.status) : json(r);
        }
        case "guia": {
            const datos = await leerCuerpo(ctx.request, EsquemaBase);
            if (datos instanceof Response) return datos;
            const r = await pedirGuia(alumno.idAlumno, datos.contexto);
            return "error" in r ? error(r.error, r.status) : json(r);
        }
        default:
            return error("Acción desconocida", 404);
    }
};
