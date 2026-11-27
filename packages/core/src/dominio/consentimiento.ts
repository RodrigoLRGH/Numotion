// Reglas del consentimiento del tutor (RC-08, RNF-10, ADR-009, 03-seguridad §6). Sin ARCO: RC-07 está fuera del MVP.

export type EstadoConsentimiento = "pendiente" | "vigente" | "revocado" | "por_renovar" | "vencido";

export interface DatosEstado {
    aceptadoEn: Date | null;
    revocadoEn: Date | null;
    versionAviso: string;
    versionVigente: string | null;
    tokenExpiraEn: Date;
}

export function estadoConsentimiento(c: DatosEstado, ahora = new Date()): EstadoConsentimiento {
    if (c.revocadoEn) return "revocado";
    if (c.aceptadoEn) return c.versionVigente && c.versionAviso !== c.versionVigente ? "por_renovar" : "vigente";
    return c.tokenExpiraEn < ahora ? "vencido" : "pendiente";
}

/** "rosa.lopez@correo.mx" → "r*******z@correo.mx": el tutor reconoce su correo sin exponerlo. */
export function enmascararCorreo(correo: string): string {
    const [usuario, dominio] = correo.split("@");
    if (!dominio || !usuario) return "***";
    if (usuario.length <= 2) return `${usuario[0]}*@${dominio}`;
    return `${usuario[0]}${"*".repeat(Math.min(usuario.length - 2, 8))}${usuario[usuario.length - 1]}@${dominio}`;
}

export const PARENTESCOS = ["madre", "padre", "tutor legal", "abuela", "abuelo", "otro"] as const;
/** Textos para el tutor de cada resultado de las funciones de BD. */
export const MENSAJE_RESULTADO: Record<string, string> = {
    token_invalido: "Este enlace no es válido. Pide uno nuevo a la maestra o maestro.",
    token_vencido: "Este enlace venció. Pide uno nuevo a la maestra o maestro.",
    revocado: "Este permiso ya fue retirado. Si quieres darlo de nuevo, pide un enlace nuevo a la maestra o maestro.",
    otp_invalido: "El código no es correcto. Revísalo e inténtalo de nuevo.",
    otp_vencido: "El código venció o se usó demasiadas veces. Pide uno nuevo.",
    espera: "Ya enviamos un código hace menos de un minuto. Revisa tu correo o espera un momento.",
};
