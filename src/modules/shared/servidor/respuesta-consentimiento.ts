// Traducción de resultados del flujo del tutor a respuestas HTTP (05-contratos §2)
import { MENSAJE_RESULTADO } from "../dominio/consentimiento";
import { error } from "./http";

const STATUS: Record<string, number> = { token_invalido: 404, token_vencido: 410, revocado: 409, otp_invalido: 422, otp_vencido: 422, espera: 429 };

export function respuestaDeResultado(r: string): Response {
    const status = STATUS[r] ?? 400;
    const code = status === 404 ? "NO_ENCONTRADO" : status === 429 ? "LIMITE_EXCEDIDO" : status === 422 ? "VALIDACION" : "CONFLICTO";
    return error(code, MENSAJE_RESULTADO[r] ?? "No se pudo completar la solicitud.", status, { resultado: r });
}
