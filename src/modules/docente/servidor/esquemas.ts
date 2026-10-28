// Esquemas de entrada del módulo docente (EXP-03). El destino es una unión discriminada y estricta:
// grupo XOR alumnos, también en tiempo de compilación.
import { z } from "astro/zod";
import { TIPOS_INTERACCION } from "../../shared/dominio/catalogo";

const idsTipo = TIPOS_INTERACCION.map((t) => t.id) as [string, ...string[]];

export const DestinoActividad = z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("grupo"), grupoId: z.string().uuid() }).strict(),
    z.object({ tipo: z.literal("alumnos"), alumnoIds: z.array(z.string().uuid()).min(1).max(60) }).strict(),
]);

export const CrearActividad = z.object({
    nombre: z.string().trim().min(1).max(120),
    temaId: z.string().uuid(),
    tipoInteraccion: z.enum(idsTipo),
    fechaAsignacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "formato AAAA-MM-DD"),
    numEjercicios: z.number().int().min(3).max(30).default(10),
    destino: z.unknown(),
});

export const Fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
