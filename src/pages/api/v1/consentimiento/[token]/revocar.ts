// POST /api/v1/consentimiento/:token/revocar { otp } → cierra las sesiones del alumno (EXP-01.5)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { revocarConsentimiento } from "../../../../../modules/shared/servidor/consentimiento";
import { ipDe, json, leerCuerpo } from "../../../../../modules/shared/servidor/http";
import { respuestaDeResultado } from "../../../../../modules/shared/servidor/respuesta-consentimiento";

const Esquema = z.object({ otp: z.string().trim().regex(/^\d{6}$/, "6 dígitos") });

export const POST: APIRoute = async (ctx) => {
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await revocarConsentimiento(ctx.params.token ?? "", datos.otp, ipDe(ctx));
    return r === "ok" ? json({ revocado: true }) : respuestaDeResultado(r);
};
