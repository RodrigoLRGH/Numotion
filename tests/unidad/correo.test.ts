// T-03-01-09 · proveedor SMTP (Google Workspace) sin enviar correos reales: transporte de flujo de nodemailer
import nodemailer, { type SendMailOptions } from "nodemailer";
import { describe, expect, it } from "vitest";
import { configSmtp, smtp } from "../../src/modules/shared/servidor/correo";

const env = (valores: Record<string, string>) => (k: string) => valores[k];

describe("configuración SMTP", () => {
    it("usa smtp.gmail.com:465 por defecto y quita los espacios de la contraseña de aplicación", () => {
        expect(configSmtp(env({ SMTP_USUARIO: "numotion@escuela.mx", SMTP_PASSWORD: "abcd efgh ijkl mnop" }))).toEqual({
            host: "smtp.gmail.com",
            port: 465,
            usuario: "numotion@escuela.mx",
            password: "abcdefghijklmnop",
            remitente: "numotion@escuela.mx",
        });
    });

    it("respeta MAIL_FROM y el puerto 587", () => {
        const c = configSmtp(env({ SMTP_USUARIO: "u@escuela.mx", SMTP_PASSWORD: "x", SMTP_PORT: "587", MAIL_FROM: "Numotion <no-responder@escuela.mx>" }));
        expect(c).toMatchObject({ port: 587, remitente: "Numotion <no-responder@escuela.mx>" });
    });

    it("dice qué variables faltan", () => {
        expect(configSmtp(env({}))).toEqual({ faltan: ["SMTP_USUARIO", "SMTP_PASSWORD"] });
    });
});

describe("envío SMTP", () => {
    it("arma el mensaje con remitente, destinatario, asunto y texto en UTF-8", async () => {
        const transporte = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
        const enviados: string[] = [];
        const original = transporte.sendMail.bind(transporte);
        transporte.sendMail = (async (m: SendMailOptions) => {
            const info = await original(m);
            enviados.push((info.message as Buffer).toString("utf8"));
            return info;
        }) as typeof transporte.sendMail;

        const config = { host: "h", port: 465, usuario: "u", password: "p", remitente: "Numotion <no-responder@escuela.mx>" };
        await smtp(config, transporte).enviar({ para: "tutor@correo.mx", asunto: "Tu código de verificación", texto: "Tu código es 123456. Vence en 10 minutos." });

        expect(enviados).toHaveLength(1);
        const m = enviados[0];
        expect(m).toMatch(/^From: Numotion <no-responder@escuela\.mx>$/m);
        expect(m).toMatch(/^To: tutor@correo\.mx$/m);
        // Asunto con acentos codificado en UTF-8 (la ó es =C3=B3)
        expect(m).toMatch(/^Subject: .*=C3=B3/m);
        expect(m).toMatch(/charset=utf-8/i);
        expect(m).toContain("123456");
    });
});
