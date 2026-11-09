// Recibe un fotograma, obtiene la emoción y descarta la imagen (RNF-03, RC-05, RI-06).
import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { db, RegistroEmocion } from "astro:db";
import { cargarEstado } from "../../../modules/alumno/servidor/motor-ejercicios";
import { proveedorEmociones, puedeDetectar } from "../../../modules/shared/servidor/proveedor-emociones";
import { alumnoDe, error, json, leerCuerpo } from "../../../modules/shared/servidor/http";

const MAX_BYTES = 300_000;

const Esquema = z.object({
    imagen: z.string().max(Math.ceil((MAX_BYTES * 4) / 3) + 100),
    contexto: z.object({ tipo: z.enum(["asignacion", "practica"]), id: z.number().int().positive() }).optional(),
});

export const POST: APIRoute = async (ctx) => {
    const alumno = alumnoDe(ctx);
    const datos = await leerCuerpo(ctx.request, Esquema);
    if (datos instanceof Response) return datos;
    if (!puedeDetectar(alumno.idAlumno)) return json({ ok: true, omitido: true });

    const base64 = datos.imagen.replace(/^data:image\/\w+;base64,/, "");
    let bytes: Uint8Array | null = Uint8Array.from(Buffer.from(base64, "base64"));
    if (bytes.length === 0 || bytes.length > MAX_BYTES) return error("Imagen inválida");

    const estado = datos.contexto ? await cargarEstado(alumno.idAlumno, datos.contexto) : null;

    let deteccion;
    try {
        deteccion = await proveedorEmociones().detectar(bytes);
    } catch {
        // Nunca se registra el contenido de la imagen
        return error("Servicio de detección no disponible", 503);
    } finally {
        bytes = null;
    }

    if (deteccion.emocion !== "UNKNOWN") {
        await db.insert(RegistroEmocion).values({
            id_alumno: alumno.idAlumno,
            id_tema: estado?.idTema ?? null,
            id_asignacion: datos.contexto?.tipo === "asignacion" && estado ? datos.contexto.id : null,
            emocion: deteccion.emocion,
            confianza: deteccion.confianza,
        });
    }
    return json({ ok: true, ...deteccion });
};
