import type { APIContext } from "astro";
import type { z } from "astro/zod";
import type { UsuarioSesion } from "./auth";

export function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
}

export function error(mensaje: string, status = 400): Response {
    return json({ ok: false, error: mensaje }, status);
}

/** Lee y valida el cuerpo JSON; devuelve Response de error si no es válido. */
export async function leerCuerpo<T extends z.ZodTypeAny>(request: Request, esquema: T): Promise<z.infer<T> | Response> {
    let crudo: unknown;
    try {
        crudo = await request.json();
    } catch {
        return error("Cuerpo JSON inválido");
    }
    const r = esquema.safeParse(crudo);
    if (!r.success) {
        const primero = r.error.issues[0];
        return error(`Dato inválido en «${primero?.path.join(".") || "cuerpo"}»: ${primero?.message ?? ""}`);
    }
    return r.data;
}

export function docenteDe(ctx: APIContext): UsuarioSesion {
    const u = ctx.locals.usuario;
    if (!u || u.rol !== "docente") throw new Error("El middleware debió bloquear esta ruta");
    return u;
}

export function alumnoDe(ctx: APIContext): UsuarioSesion & { idAlumno: number; idGrupo: number } {
    const u = ctx.locals.usuario;
    if (!u || u.rol !== "alumno" || u.idAlumno === undefined || u.idGrupo === undefined) {
        throw new Error("El middleware debió bloquear esta ruta");
    }
    return u as UsuarioSesion & { idAlumno: number; idGrupo: number };
}
