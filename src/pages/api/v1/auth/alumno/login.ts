// POST /api/v1/auth/alumno/login: grupo + avatar elegido + PIN de 4 íconos (ADR-004, ADR-009)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fijarCookieSesion, loginAlumno } from "../../../../../modules/shared/servidor/auth";
import { destinoTrasLogin } from "../../../../../modules/shared/servidor/guardas";
import { error, ipDe, json, leerCuerpo } from "../../../../../modules/shared/servidor/http";

const Esquema = z.object({
    grupoId: z.string().uuid(),
    alumnoId: z.string().uuid(),
    pin: z.array(z.string().max(20)).length(4),
    siguiente: z.string().max(300).optional(),
});

export const POST: APIRoute = async (ctx) => {
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await loginAlumno(datos.grupoId, datos.alumnoId, datos.pin, ipDe(ctx));
    if (!r.ok) return error(r.code, r.message, r.status);
    fijarCookieSesion(ctx.cookies, r.sesion);
    return json({
        alumno: r.alumno,
        sesion: { id: r.sesionId },
        camaraPermitida: r.camaraPermitida,
        destino: destinoTrasLogin("alumno", datos.siguiente),
    });
};
