// Rutas del módulo docente (05-contratos §4). La guarda de rol se aplica al montar el router.
import { Router } from "express";
import { z } from "zod";
import { AVATARES, ICONOS_PIN } from "@numotion/core/dominio/acceso";
import { conContexto } from "../../infra/db";
import { enviarInvitacion, renovarInvitacion } from "../core/consentimiento";
import { consulta, contextoDe, docenteDe, ErrorHttp, noEncontrado, paramId, ruta, validar } from "../core/http";
import { actividadesAsignadas, crearActividad, historial, previsualizarNiveles, type DatosActividad } from "./actividades";
import { CrearActividad, DestinoActividad, Fecha } from "./esquemas";
import { alumnosDelGrupo, crearAlumno, crearGrupo, gruposDelDocente } from "./grupos";

export const rutasDocente = Router();

// ───────────── Grupos y alumnos (§4.1) ─────────────

const NuevoGrupo = z.object({
    nombre: z.string().trim().min(1).max(40),
    grado: z.number().int().min(1).max(6),
    cicloEscolar: z.string().trim().regex(/^\d{4}-\d{4}$/, "formato 2026-2027"),
});

rutasDocente.get("/grupos", ruta(async (_req, res) => {
    res.json({ items: await conContexto(contextoDe(docenteDe(res)), gruposDelDocente) });
}));

rutasDocente.post("/grupos", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const d = validar(NuevoGrupo, req.body);
    res.status(201).json(await conContexto(contextoDe(docente), (tx) => crearGrupo(tx, docente.id, d)));
}));

const idsAvatar = AVATARES.map((a) => a.id) as [string, ...string[]];
const idsPin = ICONOS_PIN.map((i) => i.id) as [string, ...string[]];

const NuevoAlumno = z.object({
    nombre: z.string().trim().min(2).max(60),
    apellidos: z.string().trim().max(80).default(""),
    avatar: z.enum(idsAvatar).optional(),
    pin: z.array(z.enum(idsPin)).length(4).optional(),
    tutorNombre: z.string().trim().min(3).max(120),
    tutorEmail: z.string().trim().toLowerCase().email().max(120),
    intereses: z.array(z.string().trim().min(1).max(30)).max(5).optional(),
});

rutasDocente.get("/grupos/:id/alumnos", ruta(async (req, res) => {
    const id = paramId(req, "id", "Grupo no encontrado");
    const alumnos = await conContexto(contextoDe(docenteDe(res)), (tx) => alumnosDelGrupo(tx, id));
    if (!alumnos) throw noEncontrado("Grupo no encontrado");
    res.json({ items: alumnos });
}));

rutasDocente.post("/grupos/:id/alumnos", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Grupo no encontrado");
    const d = validar(NuevoAlumno, req.body);
    const r = await conContexto(contextoDe(docente), (tx) => crearAlumno(tx, id, d));
    if (!r.ok) throw new ErrorHttp(r.status, r.status === 404 ? "NO_ENCONTRADO" : r.status === 409 ? "CONFLICTO" : "VALIDACION", r.message);
    // El docente recibe el enlace aunque falle el correo, para compartirlo por otro medio
    const url = `${origen(req)}/consentimiento/${r.invitacion.token}`;
    const correoEnviado = await enviarInvitacion(d.tutorEmail, r.alumno.nombre.split(" ")[0], url, r.invitacion.expira);
    res.status(201).json({ alumno: r.alumno, pin: r.pin, invitacion: { url, expira: r.invitacion.expira }, correoEnviado });
}));

// Enlace nuevo para el tutor (vencido, revocado o aviso por renovar)
rutasDocente.post("/alumnos/:id/invitacion", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Alumno no encontrado");
    const r = await conContexto(contextoDe(docente), async (tx) => {
        const inv = await renovarInvitacion(tx, id);
        const [a] = inv ? await tx`SELECT nombre FROM alumno WHERE id = ${id}` : [];
        return inv && { ...inv, alumno: a.nombre as string };
    });
    if (!r) throw noEncontrado("Alumno no encontrado");
    const url = `${origen(req)}/consentimiento/${r.token}`;
    const correoEnviado = await enviarInvitacion(r.tutorEmail, r.alumno.split(" ")[0], url, r.expira);
    res.status(201).json({ invitacion: { url, expira: r.expira }, correoEnviado });
}));

/** Origen público del SPA para los enlaces de los correos (detrás del proxy de Vite o de Vercel). */
function origen(req: { get(h: string): string | undefined; protocol: string }): string {
    return process.env.WEB_ORIGIN ?? `${req.get("x-forwarded-proto") ?? req.protocol}://${req.get("x-forwarded-host") ?? req.get("host")}`;
}

// ───────────── Actividades (§4.3) ─────────────

const FiltrosActividades = z.object({
    estado: z.enum(["activas", "todas"]).default("activas"),
    grupoId: z.string().uuid().optional(),
    cursor: z.string().max(200).optional(),
});

rutasDocente.get("/actividades", ruta(async (req, res) => {
    const f = validar(FiltrosActividades, consulta(req));
    res.json(await conContexto(contextoDe(docenteDe(res)), (tx) => actividadesAsignadas(tx, f)));
}));

rutasDocente.post("/actividades", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const datos = validar(CrearActividad, req.body);
    const destino = DestinoActividad.safeParse(datos.destino);
    if (!destino.success) {
        throw new ErrorHttp(422, "ASIGNACION_DESTINO_INVALIDO", "Elige un grupo o una lista de alumnos, no ambos", destino.error.issues);
    }
    const r = await conContexto(contextoDe(docente), (tx) => crearActividad(tx, docente.id, { ...datos, destino: destino.data } as DatosActividad));
    if (!r.ok) throw new ErrorHttp(r.status, r.status === 404 ? "NO_ENCONTRADO" : "VALIDACION", r.message);
    res.status(201).json({ actividadId: r.actividadId, asignaciones: r.asignaciones });
}));

const Previsualizar = z.object({
    temaId: z.string().uuid(),
    grupoId: z.string().uuid().optional(),
    alumnoIds: z.string().max(60 * 37).optional(),
});

rutasDocente.get("/actividades/previsualizar-niveles", ruta(async (req, res) => {
    const q = validar(Previsualizar, consulta(req));
    const alumnoIds = q.alumnoIds?.split(",").filter(Boolean) ?? [];
    if (Boolean(q.grupoId) === alumnoIds.length > 0 || !alumnoIds.every((id) => z.string().uuid().safeParse(id).success)) {
        throw new ErrorHttp(422, "ASIGNACION_DESTINO_INVALIDO", "Elige un grupo o una lista de alumnos, no ambos");
    }
    const destino = q.grupoId ? { tipo: "grupo" as const, grupoId: q.grupoId } : { tipo: "alumnos" as const, alumnoIds };
    const niveles = await conContexto(contextoDe(docenteDe(res)), (tx) => previsualizarNiveles(tx, q.temaId, destino));
    if (!niveles) throw noEncontrado("Grupo o alumnos no encontrados");
    res.json({ items: niveles });
}));

// ───────────── Historial (§4.3, RF-59) ─────────────

const FiltrosHistorial = z.object({
    alumnoId: z.string().uuid().optional(),
    temaId: z.string().uuid().optional(),
    grupoId: z.string().uuid().optional(),
    desde: Fecha.optional(),
    hasta: Fecha.optional(),
    cursor: z.string().max(200).optional(),
});

rutasDocente.get("/historial", ruta(async (req, res) => {
    const f = validar(FiltrosHistorial, consulta(req));
    res.json(await conContexto(contextoDe(docenteDe(res)), (tx) => historial(tx, f)));
}));
