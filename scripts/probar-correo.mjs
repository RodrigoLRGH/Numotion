// Verifica la configuración SMTP (Google Workspace) y, opcionalmente, envía un correo de prueba.
// Uso: npm run correo:probar                      → solo valida conexión y credenciales
//      npm run correo:probar -- tu@correo.mx      → además envía un correo de prueba
import nodemailer from "nodemailer";

const usuario = process.env.SMTP_USUARIO;
const password = process.env.SMTP_PASSWORD?.replace(/\s+/g, "");
if (!usuario || !password) {
    console.error("Faltan SMTP_USUARIO y/o SMTP_PASSWORD (ver .env.example)");
    process.exit(1);
}
const port = Number(process.env.SMTP_PORT ?? 465);
const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: usuario, pass: password },
});

try {
    await t.verify();
    console.log(`Conexión y credenciales correctas (${usuario}).`);
    const destino = process.argv[2];
    if (destino) {
        await t.sendMail({
            from: process.env.MAIL_FROM ?? usuario,
            to: destino,
            subject: "Numotion: correo de prueba",
            text: "Si recibes este mensaje, el envío de correos está configurado correctamente.",
        });
        console.log(`Correo de prueba enviado a ${destino}.`);
    }
} catch (e) {
    console.error(`No se pudo: ${e.message}`);
    if (/535|Username and Password not accepted/i.test(e.message)) {
        console.error("Usa una contraseña de aplicación (requiere verificación en dos pasos), no la contraseña normal de la cuenta.");
    }
    process.exit(1);
}
