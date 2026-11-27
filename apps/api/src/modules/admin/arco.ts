// Atención de solicitudes ARCO y revocaciones por el administrador (RC-07, RC-08, RNF-10).
// Las funciones de BD exigen app.role = 'admin', anonimizan con fn_anonimizar_alumno y auditan.
import { NOMBRE_TIPO_ARCO, type TipoSolicitudArco } from "@numotion/core/dominio/consentimiento";
import { NOMBRE_PRODUCTO } from "@numotion/core/marca";
import { proveedorCorreo } from "../../infra/correo";
import type { Tx } from "../../infra/db";

export interface SolicitudArco {
    id: string;
    tipo: TipoSolicitudArco;
    detalle: string;
    creadaEn: string;
    /** Fecha límite (YYYY-MM-DD): 20 días hábiles después de creada */
    limite: string;
    atendidaEn: string | null;
    respuesta: string | null;
    atendidaPor: string | null;
    alumno: { id: string; nombre: string; anonimizado: boolean };
    grupo: string;
    docente: string;
    tutor: { nombre: string; correo: string };
}

interface Fila {
    id: string;
    tipo: TipoSolicitudArco;
    detalle: string;
    creada_en: Date;
    limite: Date;
    atendida_en: Date | null;
    respuesta: string | null;
    atendida_por: string | null;
    alumno_id: string;
    alumno: string;
    anonimizado: boolean;
    grupo: string;
    docente: string;
    tutor_nombre: string;
    tutor_email: string;
}

export async function solicitudesArco(tx: Tx, soloPendientes: boolean): Promise<SolicitudArco[]> {
    const filas = await tx.$queryRaw<Fila[]>`SELECT * FROM fn_admin_solicitudes_arco(${soloPendientes})`;
    return filas.map((f) => ({
        id: f.id,
        tipo: f.tipo,
        detalle: f.detalle,
        creadaEn: f.creada_en.toISOString(),
        limite: f.limite.toISOString().slice(0, 10),
        atendidaEn: f.atendida_en?.toISOString() ?? null,
        respuesta: f.respuesta,
        atendidaPor: f.atendida_por,
        alumno: { id: f.alumno_id, nombre: f.alumno, anonimizado: f.anonimizado },
        grupo: f.grupo,
        docente: f.docente,
        tutor: { nombre: f.tutor_nombre, correo: f.tutor_email },
    }));
}

export type ResultadoAtencion =
    | { resultado: "ok"; tutorEmail: string; tutorNombre: string; alumno: string; tipo: TipoSolicitudArco }
    | { resultado: "no_encontrada" | "ya_atendida" | "anonimizar_no_aplica" };

export async function atenderSolicitud(tx: Tx, id: string, respuesta: string, anonimizar: boolean, ip: string | null): Promise<ResultadoAtencion> {
    const [r] = await tx.$queryRaw<{ resultado: string; tutor_email: string | null; tutor_nombre: string | null; alumno: string | null; tipo: TipoSolicitudArco | null }[]>`
        SELECT * FROM fn_admin_atender_arco(${id}::uuid, ${respuesta}, ${anonimizar}, ${ip}::inet)`;
    if (r.resultado !== "ok") return { resultado: r.resultado as "no_encontrada" | "ya_atendida" | "anonimizar_no_aplica" };
    return { resultado: "ok", tutorEmail: r.tutor_email ?? "", tutorNombre: r.tutor_nombre ?? "", alumno: r.alumno ?? "", tipo: r.tipo! };
}

/**
 * Respuesta al tutor por correo. Se llama después de confirmar la transacción: si el envío falla,
 * la solicitud ya quedó atendida y el administrador ve que debe contactar al tutor por otro medio.
 */
export async function avisarTutor(a: Extract<ResultadoAtencion, { resultado: "ok" }>, respuesta: string, anonimizado: boolean): Promise<boolean> {
    if (!a.tutorEmail || a.tutorEmail.endsWith("@invalid")) return false;
    try {
        await proveedorCorreo().enviar({
            para: a.tutorEmail,
            asunto: `${NOMBRE_PRODUCTO}: respuesta a tu solicitud (${NOMBRE_TIPO_ARCO[a.tipo]})`,
            texto:
                `Hola${a.tutorNombre && a.tutorNombre !== "anonimizado" ? `, ${a.tutorNombre}` : ""}.\n\n` +
                `Atendimos tu solicitud de ${NOMBRE_TIPO_ARCO[a.tipo].toLowerCase()} sobre los datos de ${a.alumno}.\n\n` +
                `${respuesta}\n\n` +
                (anonimizado ? "Los datos personales del alumno se eliminaron de la plataforma. Solo se conservan estadísticas anónimas.\n\n" : "") +
                "Si tienes dudas, responde a este correo.",
        });
        return true;
    } catch {
        return false;
    }
}
