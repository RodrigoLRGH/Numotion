// GET /api/v1/docente/actividades?estado=activas|todas&grupoId=&cursor= (RF-58)
// POST /api/v1/docente/actividades → crea actividad + asignaciones en una transacción (RF-56, RF-57)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { actividadesAsignadas, crearActividad, type DatosActividad } from "../../../../../modules/docente/servidor/actividades";
import { CrearActividad, DestinoActividad } from "../../../../../modules/docente/servidor/esquemas";
import { conContexto } from "../../../../../modules/shared/servidor/db";
import { contextoDe, docenteDe, error, json, leerCuerpo, respuestaDeErrorBd } from "../../../../../modules/shared/servidor/http";

const Filtros = z.object({
    estado: z.enum(["activas", "todas"]).default("activas"),
    grupoId: z.string().uuid().optional(),
    cursor: z.string().max(200).optional(),
});

export const GET: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const f = Filtros.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!f.success) return error("VALIDACION", "Filtros inválidos", 400, f.error.issues);
    return json(await conContexto(contextoDe(docente), (tx) => actividadesAsignadas(tx, f.data)));
};

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, CrearActividad);
    if (datos instanceof Response) return datos;
    const destino = DestinoActividad.safeParse(datos.destino);
    if (!destino.success) {
        return error("ASIGNACION_DESTINO_INVALIDO", "Elige un grupo o una lista de alumnos, no ambos", 422, destino.error.issues);
    }
    try {
        const r = await conContexto(contextoDe(docente), (tx) =>
            crearActividad(tx, docente.id, { ...datos, destino: destino.data } as DatosActividad));
        if (!r.ok) return error(r.status === 404 ? "NO_ENCONTRADO" : "VALIDACION", r.message, r.status);
        return json({ actividadId: r.actividadId, asignaciones: r.asignaciones }, 201);
    } catch (e) {
        return respuestaDeErrorBd(e);
    }
};
