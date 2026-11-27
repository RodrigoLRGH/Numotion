// Reglas del consentimiento del tutor (ADR-009, 03-seguridad §6).

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
export const TIPOS_ARCO = ["acceso", "rectificacion", "cancelacion", "oposicion"] as const;
export type TipoArco = (typeof TIPOS_ARCO)[number];

/** Tipos que registra la tabla solicitud_arco (las revocaciones también se atienden ahí). */
export type TipoSolicitudArco = TipoArco | "revocacion";

export const NOMBRE_TIPO_ARCO: Record<TipoSolicitudArco, string> = {
    acceso: "Acceso",
    rectificacion: "Rectificación",
    cancelacion: "Cancelación",
    oposicion: "Oposición",
    revocacion: "Revocación del permiso",
};

/** Solicitudes cuya atención puede incluir borrar los datos personales del alumno (fn_anonimizar_alumno). */
export const TIPOS_ANONIMIZABLES: readonly TipoSolicitudArco[] = ["cancelacion", "oposicion", "revocacion"];

/** Plazo legal para atender una solicitud ARCO (RC-07): 20 días hábiles. */
export const PLAZO_ARCO_DIAS_HABILES = 20;

/** Textos para el tutor de cada resultado de las funciones de BD. */
export const MENSAJE_RESULTADO: Record<string, string> = {
    token_invalido: "Este enlace no es válido. Pide uno nuevo a la maestra o maestro.",
    token_vencido: "Este enlace venció. Pide uno nuevo a la maestra o maestro.",
    revocado: "Este permiso ya fue retirado. Si quieres darlo de nuevo, pide un enlace nuevo a la maestra o maestro.",
    otp_invalido: "El código no es correcto. Revísalo e inténtalo de nuevo.",
    otp_vencido: "El código venció o se usó demasiadas veces. Pide uno nuevo.",
    espera: "Ya enviamos un código hace menos de un minuto. Revisa tu correo o espera un momento.",
};
