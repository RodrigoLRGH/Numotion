// Registro de docentes. Los alumnos los da de alta su docente con el
// consentimiento del tutor (RC-08), nunca por autorregistro.
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { db, eq, Usuario } from "astro:db";
import { crearSesion, hashPassword } from "../../../modules/shared/servidor/auth";
import { error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    nombre: z.string().trim().min(3).max(120),
    correo: z.string().trim().toLowerCase().email().max(120),
    password: z.string().min(8, "mínimo 8 caracteres").max(200),
    aceptaAviso: z.literal(true),
});

export const POST: APIRoute = async ({ request, cookies }) => {
    const datos = await leerCuerpo(request, Esquema);
    if (datos instanceof Response) return datos;

    const [existe] = await db.select({ id: Usuario.id }).from(Usuario).where(eq(Usuario.usuario, datos.correo)).limit(1);
    if (existe) return error("Ese correo ya está registrado", 409);

    const [u] = await db
        .insert(Usuario)
        .values({ nombre: datos.nombre, usuario: datos.correo, password_hash: await hashPassword(datos.password), rol: "docente" })
        .returning({ id: Usuario.id });
    await crearSesion(u.id, cookies);
    return json({ ok: true, destino: "/docente" }, 201);
};
