// Escenario compartido por las pruebas de servicios: docente con grupo, alumnos con consentimiento
// (con o sin cámara), perfil de gamificación, sesión del día y una actividad asignada.
import { randomUUID } from "node:crypto";
import { registrarDocente } from "../../apps/api/src/modules/core/auth";
import { conContexto, type Contexto, type Tx } from "../../apps/api/src/infra/db";
import { crearAlumno, crearGrupo } from "../../apps/api/src/modules/docente/grupos";
import { crearActividad } from "../../apps/api/src/modules/docente/actividades";
import { registrarIntento, siguienteEjercicio, type ResultadoIntento } from "../../apps/api/src/modules/alumno/motor";
import { sql } from "./fixture";

export async function escenarioCompleto(opciones: { num?: number; alumnos?: number; tema?: string; tipo?: string } = {}) {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad') ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente Escenario", `esc-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctxD: Contexto = { rol: "docente", id: docente.id };
    const grupo = await conContexto(ctxD, (tx) => crearGrupo(tx, docente.id, { nombre: "3E", grado: 3, cicloEscolar: "2026-2027" }));
    const ids: string[] = [];
    for (let i = 0; i < (opciones.alumnos ?? 1); i++) {
        const r = await conContexto(ctxD, (tx) => crearAlumno(tx, grupo.id, { nombre: `Alumno${i} Prueba`, apellidos: "", tutorNombre: "T", tutorEmail: "t@c.mx" }));
        if (!r.ok) throw new Error(r.message);
        ids.push(r.alumno.id);
    }
    // Consentimiento aceptado (como si el tutor ya hubiera confirmado), perfil y sesión del día
    await sql`UPDATE consentimiento_tutor SET acepta_plataforma = true, acepta_camara = true, aceptado_en = now()
               WHERE alumno_id = ANY(${ids}::uuid[])`;
    await sql`INSERT INTO perfil_gamificacion (alumno_id) SELECT unnest(${ids}::uuid[]) ON CONFLICT DO NOTHING`;
    const sesiones: string[] = [];
    for (const id of ids) {
        const [s] = await sql`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${id}, fn_hoy_local()) RETURNING id`;
        sesiones.push(s.id);
    }
    const [{ id: temaId }] = await sql`SELECT id FROM tema WHERE clave = ${opciones.tema ?? "suma"}`;
    const [{ hoy }] = await sql`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
    const act = await conContexto(ctxD, (tx) => crearActividad(tx, docente.id, {
        nombre: "Actividad escenario", temaId, tipoInteraccion: (opciones.tipo ?? "seleccion_multiple") as "seleccion_multiple",
        fechaAsignacion: hoy, numEjercicios: opciones.num ?? 3, destino: { tipo: "grupo", grupoId: grupo.id },
    }));
    if (!act.ok) throw new Error(act.message);
    const asignaciones = await sql`SELECT id, alumno_id FROM asignacion_alumno WHERE actividad_id = ${act.actividadId}`;
    const asignacionDe = (alumno: string) => asignaciones.find((a) => a.alumno_id === alumno)!.id as string;
    const comoAlumno = <T>(fn: (tx: Tx) => Promise<T>, alumno = ids[0]) => conContexto({ rol: "alumno", id: alumno }, fn);
    const comoDocente = <T>(fn: (tx: Tx) => Promise<T>) => conContexto(ctxD, fn);
    return { docenteId: docente.id, grupoId: grupo.id, alumnos: ids, sesiones, temaId, hoy: hoy as string, actividadId: act.actividadId, asignacionDe, comoAlumno, comoDocente };
}

export type Escenario = Awaited<ReturnType<typeof escenarioCompleto>>;

/** Responde el ejercicio vigente de la asignación del alumno (bien o mal). */
export async function responderActividad(e: Escenario, bien: boolean, alumno = e.alumnos[0], extra: { ayuda?: boolean } = {}): Promise<ResultadoIntento> {
    const asignacionId = e.asignacionDe(alumno);
    const s = await e.comoAlumno((tx) => siguienteEjercicio(tx, alumno, asignacionId), alumno);
    if (!("ejercicio" in s)) throw new Error(JSON.stringify(s));
    const [{ respuesta }] = await sql`SELECT respuesta FROM ejercicio WHERE id = ${s.ejercicio.id}`;
    const r = await e.comoAlumno((tx) => registrarIntento(tx, alumno, {
        clienteId: randomUUID(), asignacionId, ejercicioId: s.ejercicio.id, respuesta: bien ? respuesta.valor : "-999", tiempoMs: 5000, ayudaSolicitada: extra.ayuda ?? false,
    }), alumno);
    if ("error" in r) throw new Error(r.error);
    return r;
}
