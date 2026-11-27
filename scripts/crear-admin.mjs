// Crea (o reactiva y cambia la contraseña de) una cuenta de administrador para atender ARCO (RC-07).
// No hay autorregistro de administradores: solo quien tiene DATABASE_OWNER_URL puede crearlos.
// Uso: npm run admin:crear -- --nombre "Nombre Apellido" --email persona@escuela.mx
//      La contraseña se lee de ADMIN_PASSWORD o se pide en la terminal (mínimo 12 caracteres).
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { parseArgs, promisify } from "node:util";
import postgres from "postgres";

const scrypt = promisify(scryptCb);
const MIN_PASSWORD = 12;

/** Mismo formato que apps/api/src/modules/core/auth.ts (hashSecreto). */
async function hashSecreto(secreto) {
    const salt = randomBytes(16);
    const hash = await scrypt(secreto, salt, 64);
    return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const { values } = parseArgs({ options: { nombre: { type: "string" }, email: { type: "string" } } });
const nombre = values.nombre?.trim();
const email = values.email?.trim().toLowerCase();
if (!nombre || nombre.length < 3 || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Uso: npm run admin:crear -- --nombre "Nombre Apellido" --email persona@escuela.mx');
    process.exit(1);
}
const url = process.env.DATABASE_OWNER_URL;
if (!url) {
    console.error("Falta DATABASE_OWNER_URL (ver .env.example)");
    process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question(`Contraseña para ${email} (mín. ${MIN_PASSWORD} caracteres; se verá al escribirla): `);
    rl.close();
}
if (!password || password.length < MIN_PASSWORD) {
    console.error(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
    const [a] = await sql`
        INSERT INTO administrador (nombre, email, password_hash) VALUES (${nombre}, ${email}, ${await hashSecreto(password)})
        ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash,
                                          activo = true, intentos_fallidos = 0, bloqueado_hasta = NULL
        RETURNING id, (xmax = 0) AS nuevo`;
    console.log(`${a.nuevo ? "Administrador creado" : "Administrador actualizado"}: ${email}. Entra en /admin/entrar`);
} finally {
    await sql.end();
}
