// Autenticación y sesiones (RNF-04, RC-07). Contraseñas con scrypt y sesiones
// opacas: en la cookie viaja un token aleatorio; en BD solo su hash SHA-256.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { AstroCookies } from "astro";
import { db, eq, Sesion, Usuario, Alumno } from "astro:db";

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const COOKIE_SESION = "ff_sesion";
const DURACION_SESION_MS = 8 * 60 * 60 * 1000; // una jornada escolar

export type Rol = "docente" | "alumno";

export interface UsuarioSesion {
    id: number;
    nombre: string;
    usuario: string;
    rol: Rol;
    /** Solo para rol alumno */
    idAlumno?: number;
    idGrupo?: number;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt, 64);
    return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verificarPassword(password: string, almacenado: string): Promise<boolean> {
    const [algoritmo, saltB64, hashB64] = almacenado.split("$");
    if (algoritmo !== "scrypt" || !saltB64 || !hashB64) return false;
    const esperado = Buffer.from(hashB64, "base64");
    const calculado = await scrypt(password, Buffer.from(saltB64, "base64"), esperado.length);
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export async function crearSesion(idUsuario: number, cookies: AstroCookies): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const expira = new Date(Date.now() + DURACION_SESION_MS);
    await db.insert(Sesion).values({ token_hash: hashToken(token), id_usuario: idUsuario, expira_en: expira });
    cookies.set(COOKIE_SESION, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: import.meta.env.PROD,
        expires: expira,
    });
}

export async function cerrarSesion(cookies: AstroCookies): Promise<void> {
    const token = cookies.get(COOKIE_SESION)?.value;
    if (token) await db.delete(Sesion).where(eq(Sesion.token_hash, hashToken(token)));
    cookies.delete(COOKIE_SESION, { path: "/" });
}

export async function usuarioDeSesion(cookies: AstroCookies): Promise<UsuarioSesion | null> {
    const token = cookies.get(COOKIE_SESION)?.value;
    if (!token) return null;
    const filas = await db
        .select({ sesion: Sesion, usuario: Usuario })
        .from(Sesion)
        .innerJoin(Usuario, eq(Sesion.id_usuario, Usuario.id))
        .where(eq(Sesion.token_hash, hashToken(token)))
        .limit(1);
    const fila = filas[0];
    if (!fila || fila.sesion.expira_en.getTime() < Date.now() || !fila.usuario.activo) return null;

    const u = fila.usuario;
    const base: UsuarioSesion = { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol as Rol };
    if (u.rol === "alumno") {
        const [alumno] = await db.select().from(Alumno).where(eq(Alumno.id_usuario, u.id)).limit(1);
        if (!alumno) return null;
        base.idAlumno = alumno.id;
        base.idGrupo = alumno.id_grupo;
    }
    return base;
}
