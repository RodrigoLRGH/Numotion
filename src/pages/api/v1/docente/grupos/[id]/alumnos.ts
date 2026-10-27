// GET/POST /api/v1/docente/grupos/:id/alumnos (05-contratos §4.1, ADR-004, ADR-009)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { AVATARES, ICONOS_PIN } from "../../../../../../modules/shared/dominio/acceso";
import { alumnosDelGrupo, crearAlumno } from "../../../../../../modules/docente/servidor/grupos";
import { enviarInvitacion } from "../../../../../../modules/shared/servidor/consentimiento";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { contextoDe, docenteDe, error, json, leerCuerpo } from "../../../../../../modules/shared/servidor/http";

const idsAvatar = AVATARES.map((a) => a.id) as [string, ...string[]];
const idsPin = ICONOS_PIN.map((i) => i.id) as [string, ...string[]];

const Esquema = z.object({
    nombre: z.string().trim().min(2).max(60),
    apellidos: z.string().trim().max(80).default(""),
    avatar: z.enum(idsAvatar).optional(),
    pin: z.array(z.enum(idsPin)).length(4).optional(),
    tutorNombre: z.string().trim().min(3).max(120),
    tutorEmail: z.string().trim().toLowerCase().email().max(120),
    intereses: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
});

const Id = z.string().uuid();

export const GET: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const id = Id.safeParse(ctx.params.id);
    const alumnos = id.success ? await conContexto(contextoDe(docente), (tx) => alumnosDelGrupo(tx, id.data)) : null;
    return alumnos ? json({ items: alumnos }) : error("NO_ENCONTRADO", "Grupo no encontrado", 404);
};

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const id = Id.safeParse(ctx.params.id);
    if (!id.success) return error("NO_ENCONTRADO", "Grupo no encontrado", 404);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await conContexto(contextoDe(docente), (tx) => crearAlumno(tx, id.data, datos));
    if (!r.ok) return error(r.status === 404 ? "NO_ENCONTRADO" : r.status === 409 ? "CONFLICTO" : "VALIDACION", r.message, r.status);
    // El docente recibe el enlace aunque falle el correo, para compartirlo por otro medio
    const url = `${ctx.url.origin}/consentimiento/${r.invitacion.token}`;
    const correoEnviado = await enviarInvitacion(datos.tutorEmail, r.alumno.nombre.split(" ")[0], url, r.invitacion.expira);
    return json({ alumno: r.alumno, pin: r.pin, invitacion: { url, expira: r.invitacion.expira }, correoEnviado }, 201);
};
