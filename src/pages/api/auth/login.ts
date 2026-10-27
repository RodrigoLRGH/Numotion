import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { Alumno, db, eq, Usuario } from "astro:db";
import { crearSesion, verificarPassword } from "../../../modules/shared/servidor/auth";
import { inicioDeRol } from "../../../modules/shared/servidor/guardas";
import { error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({
    usuario: z.string().trim().toLowerCase().min(1).max(120),
    password: z.string().min(1).max(200),
    siguiente: z.string().optional(),
});

// Bloqueo simple por fuerza bruta: 5 fallos en 15 min por usuario
const fallos = new Map<string, { n: number; desde: number }>();
const VENTANA_MS = 15 * 60_000;

function bloqueado(clave: string): boolean {
    const f = fallos.get(clave);
    if (!f) return false;
    if (Date.now() - f.desde > VENTANA_MS) {
        fallos.delete(clave);
        return false;
    }
    return f.n >= 5;
}

function registrarFallo(clave: string) {
    const f = fallos.get(clave);
    if (!f || Date.now() - f.desde > VENTANA_MS) fallos.set(clave, { n: 1, desde: Date.now() });
    else f.n++;
}

export const POST: APIRoute = async ({ request, cookies }) => {
    const datos = await leerCuerpo(request, Esquema);
    if (datos instanceof Response) return datos;
    if (bloqueado(datos.usuario)) return error("Demasiados intentos. Espera 15 minutos.", 429);

    const [u] = await db.select().from(Usuario).where(eq(Usuario.usuario, datos.usuario)).limit(1);
    if (!u || !u.activo || !(await verificarPassword(datos.password, u.password_hash))) {
        registrarFallo(datos.usuario);
        return error("Usuario o contraseña incorrectos", 401);
    }

    if (u.rol === "alumno") {
        // RC-08 / RNF-10: sin consentimiento del tutor no se permite el uso
        const [a] = await db.select().from(Alumno).where(eq(Alumno.id_usuario, u.id)).limit(1);
        if (!a?.consentimiento_tutor) return error("Falta el consentimiento de tu madre, padre o tutor. Avisa a tu maestro(a).", 403);
    }

    fallos.delete(datos.usuario);
    await crearSesion(u.id, cookies);
    const inicio = inicioDeRol(u.rol as "docente" | "alumno");
    // Solo se permite redirigir dentro del área del propio rol
    const destino = datos.siguiente?.startsWith(inicio) ? datos.siguiente : inicio;
    return json({ ok: true, destino });
};
