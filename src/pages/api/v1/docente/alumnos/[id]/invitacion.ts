// POST /api/v1/docente/alumnos/:id/invitacion → enlace nuevo para el tutor (vencido, revocado o por renovar)
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { enviarInvitacion, renovarInvitacion } from "../../../../../../modules/shared/servidor/consentimiento";
import { conContexto } from "../../../../../../modules/shared/servidor/db";
import { contextoDe, docenteDe, error, json } from "../../../../../../modules/shared/servidor/http";

export const POST: APIRoute = async (ctx) => {
    const docente = docenteDe(ctx);
    const id = z.string().uuid().safeParse(ctx.params.id);
    const r = id.success ? await conContexto(contextoDe(docente), async (tx) => {
        const inv = await renovarInvitacion(tx, id.data);
        const [a] = inv ? await tx`SELECT nombre FROM alumno WHERE id = ${id.data}` : [];
        return inv && { ...inv, alumno: a.nombre as string };
    }) : null;
    if (!r) return error("NO_ENCONTRADO", "Alumno no encontrado", 404);
    const url = `${ctx.url.origin}/consentimiento/${r.token}`;
    const correoEnviado = await enviarInvitacion(r.tutorEmail, r.alumno.split(" ")[0], url, r.expira);
    return json({ invitacion: { url, expira: r.expira }, correoEnviado }, 201);
};
