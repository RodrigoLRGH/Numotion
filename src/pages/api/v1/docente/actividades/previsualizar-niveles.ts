// GET /api/v1/docente/actividades/previsualizar-niveles?temaId=&grupoId= | &alumnoIds=a,b (EXP-03.3)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { previsualizarNiveles } from "../../../../../modules/docente/servidor/actividades";
import { conContexto } from "../../../../../modules/shared/servidor/db";
import { contextoDe, docenteDe, error, json } from "../../../../../modules/shared/servidor/http";

const Consulta = z.object({
    temaId: z.string().uuid(),
    grupoId: z.string().uuid().optional(),
    alumnoIds: z.string().max(60 * 37).optional(),
});

export const GET: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const q = Consulta.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!q.success) return error("VALIDACION", "Parámetros inválidos", 400, q.error.issues);
    const alumnoIds = q.data.alumnoIds?.split(",").filter(Boolean) ?? [];
    if (Boolean(q.data.grupoId) === alumnoIds.length > 0 || !alumnoIds.every((id) => z.string().uuid().safeParse(id).success)) {
        return error("ASIGNACION_DESTINO_INVALIDO", "Elige un grupo o una lista de alumnos, no ambos", 422);
    }
    const destino = q.data.grupoId ? { tipo: "grupo" as const, grupoId: q.data.grupoId } : { tipo: "alumnos" as const, alumnoIds };
    const niveles = await conContexto(contextoDe(docente), (tx) => previsualizarNiveles(tx, q.data.temaId, destino));
    return niveles ? json({ items: niveles }) : error("NO_ENCONTRADO", "Grupo o alumnos no encontrados", 404);
};
