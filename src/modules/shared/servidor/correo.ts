// Envío de correo desacoplado del proveedor (T-03-01-09). CORREO_PROVEEDOR:
//   smtp    → producción: Google Workspace (smtp.gmail.com:465 con contraseña de aplicación, ADR-010)
//   archivo → escribe cada correo como JSON en CORREO_DIR (desarrollo y E2E; prohibido en producción)
//   memoria → los guarda en un arreglo (pruebas)
// Sin proveedor configurado, enviar() falla en vez de perder el correo.
// Nunca se registra el contenido en logs (lleva códigos de un solo uso y datos del tutor).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";

export interface Correo {
    para: string;
    asunto: string;
    texto: string;
}

export interface ProveedorCorreo {
    enviar(correo: Correo): Promise<void>;
}

export const bandejaMemoria: (Correo & { enviadoEn: Date })[] = [];

const memoria: ProveedorCorreo = {
    async enviar(c) {
        bandejaMemoria.push({ ...c, enviadoEn: new Date() });
    },
};

function archivo(dir: string): ProveedorCorreo {
    return {
        async enviar(c) {
            await mkdir(dir, { recursive: true });
            const nombre = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}.json`;
            await writeFile(path.join(dir, nombre), JSON.stringify(c, null, 2), "utf8");
        },
    };
}

// ───────────── SMTP (Google Workspace) ─────────────

export interface ConfigSmtp {
    host: string;
    port: number;
    usuario: string;
    password: string;
    /** "Numotion <no-responder@escuela.mx>": debe ser la cuenta o un alias "Enviar como" de ella */
    remitente: string;
}

type Env = (clave: string) => string | undefined;

/** Lee la configuración SMTP; si falta algo devuelve la lista de variables faltantes. */
export function configSmtp(env: Env): ConfigSmtp | { faltan: string[] } {
    const usuario = env("SMTP_USUARIO");
    const password = env("SMTP_PASSWORD");
    const faltan = [!usuario && "SMTP_USUARIO", !password && "SMTP_PASSWORD"].filter((x): x is string => Boolean(x));
    if (faltan.length) return { faltan };
    const port = Number(env("SMTP_PORT") ?? 465);
    return {
        host: env("SMTP_HOST") ?? "smtp.gmail.com",
        port,
        usuario: usuario!,
        // Google muestra la contraseña de aplicación en bloques con espacios; no forman parte de ella
        password: password!.replace(/\s+/g, ""),
        remitente: env("MAIL_FROM") ?? usuario!,
    };
}

export function smtp(config: ConfigSmtp, transporte?: Transporter): ProveedorCorreo {
    const t =
        transporte ??
        nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465, // 465: TLS directo; 587: STARTTLS obligatorio
            requireTLS: config.port !== 465,
            auth: { user: config.usuario, pass: config.password },
            logger: false,
        });
    return {
        async enviar(c) {
            await t.sendMail({ from: config.remitente, to: c.para, subject: c.asunto, text: c.texto });
        },
    };
}

const env: Env = (clave) => (import.meta.env as Record<string, string | undefined>)[clave] ?? process.env[clave];

// El transporte SMTP mantiene conexiones: uno por instancia del servidor
let smtpCompartido: ProveedorCorreo | null = null;

export function proveedorCorreo(): ProveedorCorreo {
    const tipo = env("CORREO_PROVEEDOR");
    if (tipo === "memoria") return memoria;
    if (tipo === "archivo") {
        if (import.meta.env.PROD) throw new Error("CORREO_PROVEEDOR=archivo no se permite en producción");
        return archivo(env("CORREO_DIR") ?? "tmp/correos");
    }
    if (tipo === "smtp") {
        if (smtpCompartido) return smtpCompartido;
        const config = configSmtp(env);
        if ("faltan" in config) throw new Error(`Faltan variables de correo: ${config.faltan.join(", ")}`);
        return (smtpCompartido = smtp(config));
    }
    throw new Error("Configura CORREO_PROVEEDOR (ver .env.example)");
}
