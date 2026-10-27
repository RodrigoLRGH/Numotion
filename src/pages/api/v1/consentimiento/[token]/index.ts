// GET /api/v1/consentimiento/:token → datos mínimos y estado · POST → aceptar (ADR-009)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { PARENTESCOS } from "../../../../../modules/shared/dominio/consentimiento";
import { aceptarConsentimiento, verConsentimiento } from "../../../../../modules/shared/servidor/consentimiento";
import { error, ipDe, json, leerCuerpo } from "../../../../../modules/shared/servidor/http";
import { respuestaDeResultado } from "../../../../../modules/shared/servidor/respuesta-consentimiento";

const Esquema = z.object({
    otp: z.string().trim().regex(/^\d{6}$/, "6 dígitos"),
    tutorNombre: z.string().trim().min(3).max(120),
    parentesco: z.enum(PARENTESCOS),
    aceptaPlataforma: z.literal(true),
    aceptaCamara: z.boolean(),
});

export const GET: APIRoute = async ({ params }) => {
    const vista = await verConsentimiento(params.token ?? "");
    return vista ? json(vista) : error("NO_ENCONTRADO", "Este enlace no es válido.", 404);
};

export const POST: APIRoute = async (ctx) => {
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await aceptarConsentimiento(ctx.params.token ?? "", datos, ipDe(ctx));
    return r === "ok" ? json({ aceptado: true, aceptaCamara: datos.aceptaCamara }, 201) : respuestaDeResultado(r);
};
