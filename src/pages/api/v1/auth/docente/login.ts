// POST /api/v1/auth/docente/login (EXP-01.2, P-SEC-02)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { fijarCookieSesion, loginDocente } from "../../../../../modules/shared/servidor/auth";
import { destinoTrasLogin } from "../../../../../modules/shared/servidor/guardas";
import { error, ipDe, json, leerCuerpo } from "../../../../../modules/shared/servidor/http";

const Esquema = z.object({
    email: z.string().trim().toLowerCase().email().max(120),
    password: z.string().min(1).max(200),
    siguiente: z.string().max(300).optional(),
});

export const POST: APIRoute = async (ctx) => {
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await loginDocente(datos.email, datos.password, ipDe(ctx));
    if (!r.ok) return error(r.code, r.message, r.status);
    fijarCookieSesion(ctx.cookies, r.sesion);
    return json({ docente: r.docente, destino: destinoTrasLogin("docente", datos.siguiente) });
};
