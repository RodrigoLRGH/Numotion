// Rutas del módulo docente (05-contratos §4). La guarda de rol se aplica al montar el router.
import { Router } from "express";
import { z } from "zod";
import { AVATARES, ICONOS_PIN } from "@numotion/core/dominio/acceso";
import { conContexto } from "../../infra/db";
import { enviarInvitacion, renovarInvitacion } from "../core/consentimiento";
import { consulta, contextoDe, docenteDe, ErrorHttp, ipDe, noEncontrado, paramId, ruta, validar } from "../core/http";
import { alertas, atenderAlerta, guia } from "./alertas";
import {
    auditarVista, capturarResultado, crearNota, cruce, ficha, notas, perfilEstadistico, reporteCsv, reporteTemas, resultados, resumenGrupo,
    serieEmocional, TIPOS_CAPTURABLES,
} from "./seguimiento";
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

// ───────────── Alertas y guías (§4.4, RF-16, RF-27) ─────────────

const FiltrosAlertas = z.object({
    pendientes: z.enum(["true", "false"]).default("true"),
    grupoId: z.string().uuid().optional(),
    alumnoId: z.string().uuid().optional(),
});

rutasDocente.get("/alertas", ruta(async (req, res) => {
    const f = validar(FiltrosAlertas, consulta(req));
    res.json({ items: await conContexto(contextoDe(docenteDe(res)), (tx) => alertas(tx, { ...f, pendientes: f.pendientes === "true" })) });
}));

export const SSE_SONDEO_MS = 2500;
export const SSE_LATIDO_MS = 25_000;
export const SSE_DURACION_MS = 50_000;

/**
 * Alertas en vivo (SSE). Cada instancia consulta la BD cada 2.5 s en lugar de depender de memoria
 * compartida, así funciona con varias instancias serverless; la alerta llega en < 5 s (EXP-05.5).
 */
rutasDocente.get("/alertas/stream", ruta(async (req, res) => {
    const docente = docenteDe(res);
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    let desde = new Date(Date.now() - 1000);
    const ultimoId = req.get("last-event-id");
    if (ultimoId && !Number.isNaN(Date.parse(ultimoId))) desde = new Date(ultimoId);
    let cerrado = false;
    let ocupado = false;
    const enviar = (evento: string, datos: unknown, id?: string) => {
        if (!cerrado) res.write(`${id ? `id: ${id}\n` : ""}event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    };
    res.write("retry: 3000\n\n");
    const sondeo = setInterval(async () => {
        if (ocupado || cerrado) return;
        ocupado = true;
        try {
            const nuevas = await conContexto(contextoDe(docente), (tx) => alertas(tx, { despuesDe: desde, pendientes: true, limite: 20 }));
            for (const a of nuevas.reverse()) {
                desde = new Date(a.creadaEn);
                enviar("alerta.nueva", a, a.creadaEn);
            }
        } catch {
            // Fallo transitorio de BD: se reintenta en el siguiente sondeo
        } finally {
            ocupado = false;
        }
    }, SSE_SONDEO_MS);
    const latido = setInterval(() => enviar("ping", { t: Date.now() }), SSE_LATIDO_MS);
    // res "close" (no req): en Node ≥ 16 req emite "close" al terminar de leer el cuerpo, no al
    // desconectarse el cliente. El stream se cierra solo a los 50 s y EventSource reconecta con
    // Last-Event-ID: no quedan conexiones colgadas detrás de proxies ni funciones serverless.
    await new Promise<void>((fin) => {
        const terminar = () => {
            if (cerrado) return;
            cerrado = true;
            clearInterval(sondeo);
            clearInterval(latido);
            clearTimeout(limite);
            fin();
        };
        const limite = setTimeout(() => {
            terminar();
            res.end();
        }, SSE_DURACION_MS);
        res.on("close", terminar);
    });
}));

rutasDocente.get("/guias/:id", ruta(async (req, res) => {
    const id = paramId(req, "id", "Guía no encontrada");
    const g = await conContexto(contextoDe(docenteDe(res)), (tx) => guia(tx, id));
    if (!g) throw noEncontrado("Guía no encontrada");
    res.json(g);
}));

rutasDocente.post("/alertas/:id/atender", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Alerta no encontrada");
    const { nota } = validar(z.object({ nota: z.string().trim().max(500).optional() }), req.body ?? {});
    if (!(await conContexto(contextoDe(docente), (tx) => atenderAlerta(tx, docente.id, id, nota)))) throw noEncontrado("Alerta no encontrada");
    res.status(204).end();
}));

// ───────────── Ficha del alumno (§4.5, RF-29, RF-19, RF-50, RF-35, RF-52) ─────────────

rutasDocente.get("/alumnos/:id", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Alumno no encontrado");
    const f = await conContexto(contextoDe(docente), async (tx) => {
        const r = await ficha(tx, id);
        // Cada apertura de la ficha se audita (EXP-07.2, RC-07)
        if (r) await auditarVista(tx, docente.id, "ver_alumno", "alumno", id, ipDe(req));
        return r;
    });
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

rutasDocente.get("/alumnos/:id/emociones", ruta(async (req, res) => {
    const id = paramId(req, "id", "Alumno no encontrado");
    const q = validar(z.object({ desde: Fecha.optional(), hasta: Fecha.optional() }), consulta(req));
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => serieEmocional(tx, id, q.desde, q.hasta));
    if (!r) throw noEncontrado("Alumno no encontrado");
    res.json({ items: r });
}));

// ───────────── Reportes (§4.6, RF-18) ─────────────

const FiltrosReporte = z.object({ desde: Fecha.optional(), hasta: Fecha.optional(), orden: z.enum(["error", "frustracion"]).default("error") });

rutasDocente.get("/grupos/:id/reportes/temas", ruta(async (req, res) => {
    const id = paramId(req, "id", "Grupo no encontrado");
    const f = validar(FiltrosReporte, consulta(req));
    const r = await conContexto(contextoDe(docenteDe(res)), (tx) => reporteTemas(tx, id, f));
    if (!r) throw noEncontrado("Grupo no encontrado");
    res.json({ items: r });
}));

// CSV auditado (acción "exportar", RC-07)
rutasDocente.get("/grupos/:id/reportes/temas.csv", ruta(async (req, res) => {
    const docente = docenteDe(res);
    const id = paramId(req, "id", "Grupo no encontrado");
    const f = validar(FiltrosReporte, consulta(req));
    const r = await conContexto(contextoDe(docente), async (tx) => {
        const filas = await reporteTemas(tx, id, f);
        if (filas) await auditarVista(tx, docente.id, "exportar", "reporte_temas", id, ipDe(req));
        return filas;
    });
    if (!r) throw noEncontrado("Grupo no encontrado");
    res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reporte-temas-${f.desde ?? "inicio"}-${f.hasta ?? "hoy"}.csv"` });
    res.send(reporteCsv(r));
}));
