// POST /api/v1/consentimiento/:token/arco { otp, tipo, detalle } → 202 (se atiende en ≤ 20 días hábiles)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { TIPOS_ARCO } from "../../../../../modules/shared/dominio/consentimiento";
import { solicitarArco } from "../../../../../modules/shared/servidor/consentimiento";
import { ipDe, json, leerCuerpo } from "../../../../../modules/shared/servidor/http";
import { respuestaDeResultado } from "../../../../../modules/shared/servidor/respuesta-consentimiento";

const Esquema = z.object({
    otp: z.string().trim().regex(/^\d{6}$/, "6 dígitos"),
    tipo: z.enum(TIPOS_ARCO),
    detalle: z.string().trim().max(1000).default(""),
});

export const POST: APIRoute = async (ctx) => {
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await solicitarArco(ctx.params.token ?? "", datos.otp, datos.tipo, datos.detalle, ipDe(ctx));
    return r === "ok" ? json({ registrada: true }, 202) : respuestaDeResultado(r);
};
