// Respuestas JSON y errores con el formato de 05-contratos-de-api.md §0:
// { error: { code, message, details? } }
import type { APIContext } from "astro";
import type { z } from "astro/zod";
import postgres from "postgres";
import type { UsuarioSesion } from "./auth";
import type { Contexto } from "./db";

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

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
}

export function error(code: CodigoError, message: string, status: number, details?: unknown): Response {
    return json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status);
}

/** Lee y valida el cuerpo JSON; devuelve Response 400 si no es válido. */
export async function leerCuerpo<T extends z.ZodTypeAny>(request: Request, esquema: T): Promise<z.infer<T> | Response> {
    let crudo: unknown;
    try {
        crudo = await request.json();
    } catch {
        return error("VALIDACION", "Cuerpo JSON inválido", 400);
    }
    const r = esquema.safeParse(crudo);
    if (!r.success) {
        const primero = r.error.issues[0];
        return error("VALIDACION", `Dato inválido en «${primero?.path.join(".") || "cuerpo"}»: ${primero?.message ?? ""}`, 400, r.error.issues);
    }
    return r.data;
}

// Errores de negocio que lanzan las funciones de BD (RAISE EXCEPTION '<CODIGO>')
const ERRORES_BD: Record<string, [CodigoError, number, string]> = {
    ASIGNACION_DESTINO_INVALIDO: ["ASIGNACION_DESTINO_INVALIDO", 422, "Elige un grupo o una lista de alumnos, no ambos"],
    ASIGNACION_COMPLETADA: ["ASIGNACION_COMPLETADA", 409, "La actividad ya está completada"],
    GRUPO_NO_PERMITIDO: ["NO_ENCONTRADO", 404, "Grupo no encontrado"],
    ALUMNO_NO_PERMITIDO: ["NO_ENCONTRADO", 404, "Alumno no encontrado"],
    GRUPO_SIN_ALUMNOS: ["VALIDACION", 422, "El grupo no tiene alumnos activos"],
    EMAIL_DUPLICADO: ["CONFLICTO", 409, "Ese correo ya está registrado"],
};

/** Traduce errores de PostgreSQL a respuestas; relanza lo desconocido. */
export function respuestaDeErrorBd(e: unknown): Response {
    if (e instanceof postgres.PostgresError) {
        const conocido = ERRORES_BD[e.message];
        if (conocido) return error(conocido[0], conocido[2], conocido[1]);
        // RLS o permisos: el recurso es ajeno; se responde 404 para no revelar que existe (03-seguridad §3)
        if (e.code === "42501") return error("NO_ENCONTRADO", "Recurso no encontrado", 404);
        if (e.code === "23505") return error("CONFLICTO", "El registro ya existe", 409);
    }
    throw e;
}

export function contextoDe(u: UsuarioSesion): NonNullable<Contexto> {
    return { rol: u.rol, id: u.id };
}

export function docenteDe(ctx: APIContext): UsuarioSesion {
    const u = ctx.locals.usuario;
    if (!u || u.rol !== "docente") throw new Error("El middleware debió bloquear esta ruta");
    return u;
}

export function alumnoDe(ctx: APIContext): UsuarioSesion & { grupoId: string } {
    const u = ctx.locals.usuario;
    if (!u || u.rol !== "alumno" || !u.grupoId) throw new Error("El middleware debió bloquear esta ruta");
    return u as UsuarioSesion & { grupoId: string };
}

export function ipDe(ctx: APIContext): string | null {
    try {
        return ctx.clientAddress ?? null;
    } catch {
        return null;
    }
}
