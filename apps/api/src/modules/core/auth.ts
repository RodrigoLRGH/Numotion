// Autenticación (RNF-04, RC-07, ADR-004, ADR-010). Contraseñas y PIN con scrypt; sesiones
// opacas: en la cookie viaja un token aleatorio y en BD solo su hash SHA-256 (sesion_auth).
// Todo pasa por funciones SECURITY DEFINER: la app nunca lee hashes ni sesiones directamente.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { ICONOS_PIN, pinATexto } from "@numotion/core/dominio/acceso";
import { conContexto, type Tx } from "../../infra/db";
import { esProduccion } from "../../infra/entorno";
import type { CodigoError } from "./http";

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const COOKIE_SESION = "nm_sesion";
export const DURACION_SESION_MS = { docente: 8 * 60 * 60 * 1000, alumno: 4 * 60 * 60 * 1000 } as const;
export const MIN_PASSWORD_DOCENTE = 10;

export type Rol = "docente" | "alumno";

export interface UsuarioSesion {
    id: string;
    nombre: string;
    rol: Rol;
    /** Solo alumno */
    grupoId?: string;
    aceptaCamara?: boolean;
}

export interface SesionEmitida {
    token: string;
    expira: Date;
}

export type Fallo = { ok: false; code: CodigoError; message: string; status: number };

export async function hashSecreto(secreto: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await scrypt(secreto, salt, 64);
    return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verificarSecreto(secreto: string, almacenado: string | null): Promise<boolean> {
    const [algoritmo, saltB64, hashB64] = (almacenado ?? "").split("$");
    if (algoritmo !== "scrypt" || !saltB64 || !hashB64) return false;
    const esperado = Buffer.from(hashB64, "base64");
    const calculado = await scrypt(secreto, Buffer.from(saltB64, "base64"), esperado.length);
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

// Hash de relleno para que un correo inexistente tarde lo mismo que uno existente
let hashRelleno: Promise<string> | null = null;
const relleno = () => (hashRelleno ??= hashSecreto(randomBytes(16).toString("hex")));

export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/** Token de un solo uso (sesión, invitación al tutor): se entrega el token y se guarda el hash. */
export function nuevoToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hashToken(token) };
}

async function emitirSesion(tx: Tx, rol: Rol, id: string): Promise<SesionEmitida> {
    const { token, hash } = nuevoToken();
    const expira = new Date(Date.now() + DURACION_SESION_MS[rol]);
    await tx.$executeRaw`SELECT fn_crear_sesion_auth(${hash}, ${rol}::rol_usuario, ${id}::uuid, ${expira})`;
    return { token, expira };
}

const credencialesInvalidas = (message: string): Fallo => ({ ok: false, code: "CREDENCIALES_INVALIDAS", message, status: 401 });
const bloqueada = (message: string): Fallo => ({ ok: false, code: "CUENTA_BLOQUEADA", message, status: 423 });

// ───────────── Docente ─────────────

export async function registrarDocente(
    nombre: string,
    email: string,
    password: string,
): Promise<{ ok: true; sesion: SesionEmitida; docente: { id: string; nombre: string } }> {
    const hash = await hashSecreto(password);
    return conContexto(null, async (tx) => {
        const [{ id }] = await tx.$queryRaw<{ id: string }[]>`SELECT fn_registrar_docente(${nombre}, ${email}::citext, ${hash}) AS id`;
        await tx.$executeRaw`SELECT fn_auditar(${id}::uuid, 'docente', 'login')`;
        return { ok: true as const, sesion: await emitirSesion(tx, "docente", id), docente: { id, nombre } };
    });
}

export async function loginDocente(
    email: string,
    password: string,
    ip: string | null,
): Promise<{ ok: true; sesion: SesionEmitida; docente: { id: string; nombre: string } } | Fallo> {
    return conContexto(null, async (tx) => {
        const [d] = await tx.$queryRaw<{ id: string; nombre: string; password_hash: string; activo: boolean; bloqueado_hasta: Date | null }[]>`
            SELECT * FROM fn_auth_docente(${email}::citext)`;
        if (!d || !d.activo) {
            await verificarSecreto(password, await relleno());
            return credencialesInvalidas("Correo o contraseña incorrectos");
        }
        if (d.bloqueado_hasta && d.bloqueado_hasta > new Date()) {
            return bloqueada("Demasiados intentos. Espera 15 minutos.");
        }
        const ok = await verificarSecreto(password, d.password_hash);
        await tx.$executeRaw`SELECT fn_auth_docente_resultado(${d.id}::uuid, ${ok}, ${ip}::inet)`;
        if (!ok) return credencialesInvalidas("Correo o contraseña incorrectos");
        return { ok: true as const, sesion: await emitirSesion(tx, "docente", d.id), docente: { id: d.id, nombre: d.nombre } };
    });
}

// ───────────── Alumno (ADR-004) ─────────────

export interface GrupoParaEntrar {
    grupoId: string;
    alumnos: { id: string; avatar: string; nombreCorto: string }[];
    iconosPin: string[];
}

export async function grupoParaEntrar(codigo: string): Promise<GrupoParaEntrar | null> {
    const filas = await conContexto(null, (tx) =>
        tx.$queryRaw<{ grupo_id: string; alumno_id: string; avatar: string; nombre_corto: string }[]>`SELECT * FROM fn_avatares_grupo(${codigo})`);
    if (!filas.length) return null;
    return {
        grupoId: filas[0].grupo_id,
        alumnos: filas.map((f) => ({ id: f.alumno_id, avatar: f.avatar, nombreCorto: f.nombre_corto })),
        iconosPin: ICONOS_PIN.map((i) => i.id),
    };
}

export interface LoginAlumno {
    ok: true;
    sesion: SesionEmitida;
    alumno: { id: string; nombre: string; avatar: string };
    sesionId: string;
    camaraPermitida: boolean;
}

export async function loginAlumno(grupoId: string, alumnoId: string, pin: unknown, ip: string | null): Promise<LoginAlumno | Fallo> {
    const pinTexto = pinATexto(pin);
    return conContexto(null, async (tx) => {
        const [a] = await tx.$queryRaw<
            { id: string; nombre: string; avatar: string; pin_hash: string | null; bloqueado_hasta: Date | null; consentimiento: boolean; acepta_camara: boolean }[]
        >`SELECT * FROM fn_auth_alumno(${grupoId}::uuid, ${alumnoId}::uuid)`;
        if (!a) return credencialesInvalidas("No encontramos a ese alumno en el grupo");
        if (a.bloqueado_hasta && a.bloqueado_hasta > new Date()) {
            return bloqueada("Espera 5 minutos e inténtalo de nuevo.");
        }
        const ok = pinTexto !== null && (await verificarSecreto(pinTexto, a.pin_hash));
        if (!ok) {
            await tx.$queryRaw`SELECT fn_auth_alumno_resultado(${a.id}::uuid, false, ${ip}::inet)`;
            return credencialesInvalidas("¡Casi! Esa no es tu clave. Intenta otra vez.");
        }
        // ADR-009: sin consentimiento vigente del tutor no se entra
        if (!a.consentimiento) {
            return {
                ok: false as const,
                code: "CONSENTIMIENTO_REQUERIDO" as const,
                message: "Falta el permiso de tu mamá, papá o tutor. Avisa a tu maestro(a).",
                status: 403,
            };
        }
        const [{ sesion_id }] = await tx.$queryRaw<{ sesion_id: string }[]>`SELECT fn_auth_alumno_resultado(${a.id}::uuid, true, ${ip}::inet) AS sesion_id`;
        return {
            ok: true as const,
            sesion: await emitirSesion(tx, "alumno", a.id),
            alumno: { id: a.id, nombre: a.nombre, avatar: a.avatar },
            sesionId: sesion_id,
            camaraPermitida: a.acepta_camara,
        };
    });
}

// ───────────── Sesión ─────────────

export async function usuarioDeToken(token: string | undefined): Promise<UsuarioSesion | null> {
    if (!token) return null;
    const [s] = await conContexto(null, (tx) =>
        tx.$queryRaw<{ rol: Rol; usuario_id: string; nombre: string; grupo_id: string | null; acepta_camara: boolean }[]>`
            SELECT * FROM fn_sesion_auth(${hashToken(token)})`);
    if (!s) return null;
    return s.rol === "alumno"
        ? { id: s.usuario_id, nombre: s.nombre, rol: "alumno", grupoId: s.grupo_id ?? undefined, aceptaCamara: s.acepta_camara }
        : { id: s.usuario_id, nombre: s.nombre, rol: "docente" };
}

export async function cerrarSesionToken(token: string | undefined): Promise<void> {
    if (token) await conContexto(null, (tx) => tx.$executeRaw`SELECT fn_cerrar_sesion_auth(${hashToken(token)})`);
}

export function fijarCookieSesion(res: Response, sesion: SesionEmitida): void {
    res.cookie(COOKIE_SESION, sesion.token, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: esProduccion(),
        expires: sesion.expira,
    });
}

export function tokenDeCookies(req: Request): string | undefined {
    const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE_SESION];
    return typeof token === "string" && token ? token : undefined;
}

export function borrarCookieSesion(res: Response): void {
    res.clearCookie(COOKIE_SESION, { path: "/", httpOnly: true, sameSite: "strict", secure: esProduccion() });
}
