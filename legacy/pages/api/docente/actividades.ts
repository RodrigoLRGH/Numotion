import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { crearActividad } from "../../../modules/docente/servidor/actividades";
import { docenteDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    nombre: z.string().trim().min(3).max(80),
    idTema: z.number().int().positive(),
    tipoInteraccion: z.enum(["seleccion_multiple", "arrastrar"]),
    categoria: z.enum(["tarea", "trabajo_clase", "interrogacion"]),
    numEjercicios: z.number().int().min(3).max(20),
    fechaAsignacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // Grupo o alumnos, de forma excluyente (RF-56)
    destino: z.discriminatedUnion("tipo", [
        z.object({ tipo: z.literal("grupo"), idGrupo: z.number().int().positive() }),
        z.object({ tipo: z.literal("alumnos"), idAlumnos: z.array(z.number().int().positive()).min(1).max(60) }),
    ]),
});

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await crearActividad(docente.id, datos);
    return r.ok ? json(r, 201) : error(r.error, 422);
};
