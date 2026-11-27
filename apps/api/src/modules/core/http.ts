// Utilidades HTTP de la API (Express). Errores con el formato de 05-contratos-de-api.md §0:
// { error: { code, message, details? } }. Las rutas lanzan ErrorHttp y el manejador central responde.
import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { errorBd, type Contexto } from "../../infra/db";
import type { UsuarioSesion } from "./auth";

export type CodigoError =
    | "VALIDACION"
    | "NO_AUTENTICADO"
    | "CREDENCIALES_INVALIDAS"
    | "PROHIBIDO"
    | "CONSENTIMIENTO_REQUERIDO"
    | "DIAGNOSTICOS_PENDIENTES"
    | "NO_ENCONTRADO"
    | "CONFLICTO"
    | "ASIGNACION_COMPLETADA"
    | "ASIGNACION_DESTINO_INVALIDO"
    | "CUENTA_BLOQUEADA"
    | "LIMITE_EXCEDIDO"
    | "INTERNO";

export class ErrorHttp extends Error {
    constructor(
        readonly status: number,
        readonly code: CodigoError,
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
    }
}

export const noEncontrado = (mensaje = "Recurso no encontrado") => new ErrorHttp(404, "NO_ENCONTRADO", mensaje);

export function enviarError(res: Response, code: CodigoError, message: string, status: number, details?: unknown): void {
    res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

/** Valida con Zod; lanza 400 VALIDACION con el primer problema legible. */
export function validar<T extends z.ZodTypeAny>(esquema: T, datos: unknown): z.infer<T> {
    const r = esquema.safeParse(datos);
    if (r.success) return r.data;
    const primero = r.error.issues[0];
    throw new ErrorHttp(400, "VALIDACION", `Dato inválido en «${primero?.path.join(".") || "cuerpo"}»: ${primero?.message ?? ""}`, r.error.issues);
}

/** Query string sin los filtros vacíos que manda un formulario (?temaId=). */
export function consulta(req: Request): Record<string, string> {
    return Object.fromEntries(Object.entries(req.query).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
}

export const Uuid = z.string().uuid();

/** Parámetro de ruta UUID; un id mal formado es simplemente un recurso inexistente (404). */
export function paramId(req: Request, nombre = "id", mensaje?: string): string {
    const r = Uuid.safeParse(req.params[nombre]);
    if (!r.success) throw noEncontrado(mensaje);
    return r.data;
}

/** Envuelve un manejador async para que sus errores lleguen al manejador central. */
export const ruta =
    (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
    (req, res, next) => {
        fn(req, res).catch(next);
    };

/** Middleware async: continúa con next() salvo que la función ya haya respondido. */
export const intermedio =
    (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
    (req, res, next) => {
        fn(req, res).then(() => (res.headersSent ? undefined : next()), next);
    };

// Errores de negocio que lanzan las funciones de BD (RAISE EXCEPTION '<CODIGO>')
const ERRORES_BD: Record<string, [CodigoError, number, string]> = {
    ASIGNACION_DESTINO_INVALIDO: ["ASIGNACION_DESTINO_INVALIDO", 422, "Elige un grupo o una lista de alumnos, no ambos"],
    ASIGNACION_COMPLETADA: ["ASIGNACION_COMPLETADA", 409, "La actividad ya está completada"],
    GRUPO_NO_PERMITIDO: ["NO_ENCONTRADO", 404, "Grupo no encontrado"],
    ALUMNO_NO_PERMITIDO: ["NO_ENCONTRADO", 404, "Alumno no encontrado"],
    GRUPO_SIN_ALUMNOS: ["VALIDACION", 422, "El grupo no tiene alumnos activos"],
    EMAIL_DUPLICADO: ["CONFLICTO", 409, "Ese correo ya está registrado"],
    PROHIBIDO: ["PROHIBIDO", 403, "No tienes permiso para este recurso"],
};

export const manejadorErrores: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ErrorHttp) return enviarError(res, err.code, err.message, err.status, err.details);
    const bd = errorBd(err);
    if (bd) {
        const conocido = ERRORES_BD[bd.mensaje];
        if (conocido) return enviarError(res, conocido[0], conocido[2], conocido[1]);
        // RLS o permisos: el recurso es ajeno; 404 para no revelar que existe (03-seguridad §3)
        if (bd.codigo === "42501") return enviarError(res, "NO_ENCONTRADO", "Recurso no encontrado", 404);
        if (bd.codigo === "23505") return enviarError(res, "CONFLICTO", "El registro ya existe", 409);
    }
    // JSON mal formado (express.json) o cuerpo demasiado grande
    if (err?.type === "entity.parse.failed") return enviarError(res, "VALIDACION", "Cuerpo JSON inválido", 400);
    if (err?.type === "entity.too.large") return enviarError(res, "VALIDACION", "El cuerpo es demasiado grande", 413);
    // Nunca se registra el cuerpo de la petición (puede llevar datos del alumno o del tutor)
    console.error(`[api] ${err?.name ?? "Error"}: ${err?.message ?? err}`);
    enviarError(res, "INTERNO", "Algo salió mal. Intenta otra vez.", 500);
};

// ───────────── Usuario de la petición ─────────────

export function usuarioDe(res: Response): UsuarioSesion | null {
    return (res.locals.usuario as UsuarioSesion | null | undefined) ?? null;
}

export function contextoDe(u: UsuarioSesion): NonNullable<Contexto> {
    return { rol: u.rol, id: u.id };
}

export function docenteDe(res: Response): UsuarioSesion {
    const u = usuarioDe(res);
    if (!u || u.rol !== "docente") throw new Error("La guarda debió bloquear esta ruta");
    return u;
}

export function adminDe(res: Response): UsuarioSesion {
    const u = usuarioDe(res);
    if (!u || u.rol !== "admin") throw new Error("La guarda debió bloquear esta ruta");
    return u;
}

export function alumnoDe(res: Response): UsuarioSesion & { grupoId: string } {
    const u = usuarioDe(res);
    if (!u || u.rol !== "alumno" || !u.grupoId) throw new Error("La guarda debió bloquear esta ruta");
    return u as UsuarioSesion & { grupoId: string };
}

export function ipDe(req: Request): string | null {
    return req.ip ?? null;
}
