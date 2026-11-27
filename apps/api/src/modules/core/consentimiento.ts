// Flujo público del consentimiento del tutor (RC-08, RNF-10, T-03-01-10, ADR-009). El tutor no tiene
// cuenta: el token del enlace identifica el consentimiento y un OTP enviado a su correo prueba que es él.
// La cámara se usa con todos los alumnos (A-41): aceptar la plataforma incluye la detección emocional.
// Sin solicitudes ARCO (RC-07 fuera del MVP).
import { createHash, randomInt } from "node:crypto";
import { enmascararCorreo, estadoConsentimiento, type EstadoConsentimiento } from "@numotion/core/dominio/consentimiento";
import { NOMBRE_PRODUCTO } from "@numotion/core/marca";
import { hashToken, nuevoToken } from "./auth";
import { proveedorCorreo } from "../../infra/correo";
import { conContexto, type Tx } from "../../infra/db";

export const VIGENCIA_INVITACION_MS = 7 * 24 * 60 * 60 * 1000;

/** El OTP se guarda ligado al token: el mismo código no sirve para otro consentimiento. */
function hashOtp(tokenHash: string, otp: string): string {
    return createHash("sha256").update(`${tokenHash}:${otp.trim()}`).digest("hex");
}

export interface VistaConsentimiento {
    alumno: string;
    grupo: string;
    docente: string;
    tutorNombre: string;
    parentesco: string | null;
    correo: string;
    estado: EstadoConsentimiento;
    aviso: { version: string | null; url: string | null };
}

interface FilaConsentimiento {
    alumno_nombre: string;
    grupo: string;
    docente: string;
    tutor_nombre: string;
    tutor_email: string;
    parentesco: string | null;
    version_aviso: string;
    version_vigente: string | null;
    aviso_url: string | null;
    acepta_plataforma: boolean;
    acepta_camara: boolean;
    aceptado_en: Date | null;
    revocado_en: Date | null;
    token_expira_en: Date;
}

export async function verConsentimiento(token: string): Promise<VistaConsentimiento | null> {
    const [c] = await conContexto(null, (tx) =>
        tx.$queryRaw<FilaConsentimiento[]>`SELECT * FROM fn_consentimiento_por_token(${hashToken(token)})`);
    if (!c) return null;
    return {
        alumno: c.alumno_nombre,
        grupo: c.grupo,
        docente: c.docente,
        tutorNombre: c.tutor_nombre,
        parentesco: c.parentesco,
        correo: enmascararCorreo(c.tutor_email),
        estado: estadoConsentimiento({
            aceptadoEn: c.aceptado_en,
            revocadoEn: c.revocado_en,
            versionAviso: c.version_aviso,
            versionVigente: c.version_vigente,
            tokenExpiraEn: c.token_expira_en,
        }),
        aviso: { version: c.version_vigente, url: c.aviso_url },
    };
}

export async function enviarCodigo(token: string): Promise<"ok" | "token_invalido" | "espera"> {
    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const tokenHash = hashToken(token);
    const [r] = await conContexto(null, (tx) =>
        tx.$queryRaw<{ resultado: "ok" | "token_invalido" | "espera"; tutor_email: string }[]>`
            SELECT * FROM fn_consentimiento_nuevo_otp(${tokenHash}, ${hashOtp(tokenHash, otp)})`);
    if (r.resultado !== "ok") return r.resultado;
    await proveedorCorreo().enviar({
        para: r.tutor_email,
        asunto: `${NOMBRE_PRODUCTO}: tu código de verificación`,
        texto: `Tu código es ${otp}. Vence en 10 minutos.\n\nSi no lo pediste, ignora este mensaje.`,
    });
    return "ok";
}

export type Resultado = "ok" | "token_invalido" | "token_vencido" | "revocado" | "otp_invalido" | "otp_vencido";

export async function aceptarConsentimiento(
    token: string,
    d: { otp: string; tutorNombre: string; parentesco: string },
    ip: string | null,
): Promise<Resultado> {
    const tokenHash = hashToken(token);
    const [{ r }] = await conContexto(null, (tx) => tx.$queryRaw<{ r: Resultado }[]>`
        SELECT fn_consentimiento_aceptar(${tokenHash}, ${hashOtp(tokenHash, d.otp)}, ${d.tutorNombre}, ${d.parentesco}, ${ip}::inet) AS r`);
    return r;
}

export async function revocarConsentimiento(token: string, otp: string, ip: string | null): Promise<Resultado> {
    const tokenHash = hashToken(token);
    const [{ r }] = await conContexto(null, (tx) => tx.$queryRaw<{ r: Resultado }[]>`SELECT fn_consentimiento_revocar(${tokenHash}, ${hashOtp(tokenHash, otp)}, ${ip}::inet) AS r`);
    return r;
}

// ───────────── Invitación (lado docente) ─────────────

/** Genera un enlace nuevo para el tutor del alumno (en contexto docente). null si el alumno no es suyo. */
export async function renovarInvitacion(tx: Tx, alumnoId: string): Promise<{ token: string; expira: Date; tutorEmail: string } | null> {
    const { token, hash } = nuevoToken();
    const expira = new Date(Date.now() + VIGENCIA_INVITACION_MS);
    const [r] = await tx.$queryRaw<{ resultado: string; tutor_email: string }[]>`SELECT * FROM fn_renovar_invitacion(${alumnoId}::uuid, ${hash}, ${expira})`;
    return r.resultado === "ok" ? { token, expira, tutorEmail: r.tutor_email } : null;
}

/** Se llama después de confirmar la transacción: si el envío falla, el docente aún tiene el enlace. */
export async function enviarInvitacion(para: string, alumno: string, url: string, expira: Date): Promise<boolean> {
    try {
        await proveedorCorreo().enviar({
            para,
            asunto: `${NOMBRE_PRODUCTO}: autoriza el uso de la plataforma para ${alumno}`,
            texto:
                `Hola. La escuela invita a ${alumno} a usar ${NOMBRE_PRODUCTO}, una plataforma de práctica de matemáticas.\n\n` +
                `Antes de que pueda entrar necesitamos tu autorización. Abre este enlace para leer el aviso de privacidad y decidir:\n${url}\n\n` +
                `El enlace vence el ${expira.toLocaleDateString("es-MX")}.`,
        });
        return true;
    } catch {
        return false;
    }
}
