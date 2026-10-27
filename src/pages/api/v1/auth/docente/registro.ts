// POST /api/v1/auth/docente/registro. Los alumnos los da de alta su docente, nunca por autorregistro (RC-08).
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fijarCookieSesion, MIN_PASSWORD_DOCENTE, registrarDocente } from "../../../../../modules/shared/servidor/auth";
import { json, leerCuerpo, respuestaDeErrorBd } from "../../../../../modules/shared/servidor/http";

const Esquema = z.object({
    nombre: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email().max(120),
    password: z.string().min(MIN_PASSWORD_DOCENTE, `mínimo ${MIN_PASSWORD_DOCENTE} caracteres`).max(200),
    aceptaAviso: z.literal(true),
});

export const POST: APIRoute = async (ctx) => {
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    try {
        const r = await registrarDocente(datos.nombre, datos.email, datos.password);
        fijarCookieSesion(ctx.cookies, r.sesion);
        return json({ docente: r.docente, destino: "/docente" }, 201);
    } catch (e) {
        return respuestaDeErrorBd(e);
    }
};
