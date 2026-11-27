// Rutas del módulo docente (05-contratos §4). La guarda de rol se aplica al montar el router.
import { Router } from "express";
import { z } from "zod";
import { AVATARES, ICONOS_PIN } from "@numotion/core/dominio/acceso";
import { conContexto } from "../../infra/db";
import { enviarInvitacion, renovarInvitacion } from "../core/consentimiento";
import { consulta, contextoDe, docenteDe, ErrorHttp, noEncontrado, paramId, ruta, validar } from "../core/http";
import {
    borrarNota, capturarResultado, crearNota, cruce, editarNota, ficha, notas, perfilEstadistico, reporteTemas, resultados, resumenGrupo,
    TIPOS_CAPTURABLES,
} from "./seguimiento";
import { actividadesAsignadas, crearActividad, historial, previsualizarNiveles, type DatosActividad } from "./actividades";
import { CrearActividad, DestinoActividad, Fecha } from "./esquemas";
import { alumnosDelGrupo, crearAlumno, crearGrupo, gruposDelDocente } from "./grupos";
import { detalleRetroalimentacion, retroalimentacionesDelGrupo } from "./retroalimentaciones";

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
    // El docente recibe el enlace aunque falle el correo, para compartirlo por otro medio (RC-08)
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
        const a = inv ? await tx.alumno.findUnique({ where: { id }, select: { nombre: true } }) : null;
        return inv && a && { ...inv, alumno: a.nombre };
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

// ───────────── Resumen previo y retroalimentación (§4.2, RF-14, RF-62) ─────────────

rutasDocente.get("/grupos/:id/resumen", ruta(async (req, res) => {
    const id = paramId(req, "id", "Grupo no encontrado");
    const { fecha } = validar(z.object({ fecha: Fecha.optional() }), consulta(req));
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => resumenGrupo(tx, id, fecha));
    if (!r) throw noEncontrado("Grupo no encontrado");
    res.json(r);
}));

// ───────────── Ficha del alumno (§4.5, RF-29, RF-19, RF-50, RF-35, RF-52) ─────────────

rutasDocente.get("/alumnos/:id", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Alumno no encontrado");
    const f = await conContexto(contextoDe(docente), (tx) => ficha(tx, id));
    if (!f) throw noEncontrado("Alumno no encontrado");
    res.json(f);
}));

rutasDocente.get("/alumnos/:id/perfil-estadistico", ruta(async (req, res) => {
    const id = paramId(req, "id", "Alumno no encontrado");
    const { temaId } = validar(z.object({ temaId: z.string().uuid().optional() }), consulta(req));
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => perfilEstadistico(tx, id, temaId));
    if (!r) throw noEncontrado("Alumno no encontrado");
    res.json({ porTema: r });
}));

rutasDocente.get("/alumnos/:id/notas", ruta(async (req, res) => {
    const id = paramId(req, "id", "Alumno no encontrado");
    const r = await conContexto(contextoDe(docenteDe(res)), async (tx) => ((await tx.alumno.findUnique({ where: { id }, select: { id: true } })) ? notas(tx, id) : null));
    if (!r) throw noEncontrado("Alumno no encontrado");
    res.json({ items: r });
}));

const NuevaNota = z.object({
    texto: z.string().trim().min(1).max(500),
    etiqueta: z.enum(["conducta", "emocional", "academico", "otro"]).nullish(),
});

rutasDocente.post("/alumnos/:id/notas", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Alumno no encontrado");
    const d = validar(NuevaNota, req.body);
    const n = await conContexto(contextoDe(docente), (tx) => crearNota(tx, docente.id, id, d));
    if (!n) throw noEncontrado("Alumno no encontrado");
    res.status(201).json(n);
}));

// Solo el autor edita o borra; cualquier otro caso responde 404 (no revela si la nota existe)
rutasDocente.put("/alumnos/:id/notas/:notaId", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Nota no encontrada");
    const notaId = paramId(req, "notaId", "Nota no encontrada");
    const d = validar(NuevaNota, req.body);
    const n = await conContexto(contextoDe(docente), (tx) => editarNota(tx, docente.id, id, notaId, d));
    if (!n) throw noEncontrado("Nota no encontrada");
    res.json(n);
}));

rutasDocente.delete("/alumnos/:id/notas/:notaId", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Nota no encontrada");
    const notaId = paramId(req, "notaId", "Nota no encontrada");
    if (!(await conContexto(contextoDe(docente), (tx) => borrarNota(tx, docente.id, id, notaId)))) throw noEncontrado("Nota no encontrada");
    res.status(204).end();
}));

rutasDocente.get("/alumnos/:id/resultados", ruta(async (req, res) => {
    const id = paramId(req, "id", "Alumno no encontrado");
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => resultados(tx, id));
    if (!r) throw noEncontrado("Alumno no encontrado");
    res.json(r);
}));

const NuevoResultado = z.object({
    temaId: z.string().uuid(),
    tipo: z.enum(TIPOS_CAPTURABLES),
    titulo: z.string().trim().min(1).max(120),
    calificacion: z.number().min(0).max(10),
    fecha: Fecha,
});

rutasDocente.post("/alumnos/:id/resultados", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Alumno no encontrado");
    const d = validar(NuevoResultado, req.body);
    const r = await conContexto(contextoDe(docente), (tx) => capturarResultado(tx, docente.id, id, { ...d, calificacion: Math.round(d.calificacion * 100) / 100 }));
    if (!r) throw noEncontrado("Alumno o tema no encontrado");
    res.status(201).json(r);
}));

rutasDocente.get("/alumnos/:id/cruce", ruta(async (req, res) => {
    const id = paramId(req, "id", "Alumno no encontrado");
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => cruce(tx, id));
    if (!r) throw noEncontrado("Alumno no encontrado");
    res.json({ porTema: r });
}));

// ───────────── Reportes (§4.6, RF-18) ─────────────

const FiltrosReporte = z.object({ desde: Fecha.optional(), hasta: Fecha.optional(), alumnoId: z.string().uuid().optional() });

rutasDocente.get("/grupos/:id/reportes/temas", ruta(async (req, res) => {
    const id = paramId(req, "id", "Grupo no encontrado");
    const f = validar(FiltrosReporte, consulta(req));
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => reporteTemas(tx, id, f));
    if (!r) throw noEncontrado("Grupo no encontrado");
    res.json({ items: r });
}));

// ───────────── Retroalimentaciones de diagnóstico (RF-61, RF-62) ─────────────

rutasDocente.get("/grupos/:id/retroalimentaciones", ruta(async (req, res) => {
    const id = paramId(req, "id", "Grupo no encontrado");
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => retroalimentacionesDelGrupo(tx, id));
    if (!r) throw noEncontrado("Grupo no encontrado");
    res.json({ items: r });
}));

rutasDocente.get("/retroalimentaciones/:id", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Retroalimentación no encontrada");
    const r = await conContexto(contextoDe(docente), (tx) => detalleRetroalimentacion(tx, id));
    if (!r) throw noEncontrado("Retroalimentación no encontrada");
    res.json(r);
}));
