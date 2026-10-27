// POST /api/v1/consentimiento/:token/otp → envía un código de 6 dígitos al correo del tutor (1 por minuto)
import type { APIRoute } from "astro";
import { enviarCodigo } from "../../../../../modules/shared/servidor/consentimiento";
import { json } from "../../../../../modules/shared/servidor/http";
import { respuestaDeResultado } from "../../../../../modules/shared/servidor/respuesta-consentimiento";

export const POST: APIRoute = async ({ params }) => {
    const r = await enviarCodigo(params.token ?? "");
    return r === "ok" ? json({ enviado: true }, 202) : respuestaDeResultado(r);
};
