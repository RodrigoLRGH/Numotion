import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { crearAlumno } from "../../../modules/docente/servidor/grupos";
import { docenteDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    idGrupo: z.number().int().positive(),
    nombre: z.string().trim().min(3).max(120),
    usuario: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9._-]{3,30}$/, "solo letras, números, punto, guion; 3 a 30 caracteres"),
    password: z.string().min(4, "mínimo 4 caracteres").max(100),
    tutorNombre: z.string().trim().min(3).max(120),
    tutorContacto: z.string().trim().min(5).max(120),
    // RNF-10 / RC-08: sin consentimiento verificable no se da de alta
    consentimiento: z.literal(true),
});

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await crearAlumno(docente.id, datos);
    return r.ok ? json({ ok: true, id: r.id }, 201) : error(r.error, 409);
};
