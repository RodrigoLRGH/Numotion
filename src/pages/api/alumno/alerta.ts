// El alumno decide si quiere recibir la guía de calma (RF-27).
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { Alerta, and, db, eq } from "astro:db";
import { alumnoDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const Esquema = z.object({ id: z.number().int().positive(), acepta: z.boolean() });

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    const r = await db
        .update(Alerta)
        .set({ guia_aceptada: datos.acepta })
        .where(and(eq(Alerta.id, datos.id), eq(Alerta.id_alumno, alumno.idAlumno)))
        .returning({ id: Alerta.id });
    return r.length ? json({ ok: true }) : error("Alerta no encontrada", 404);
};
