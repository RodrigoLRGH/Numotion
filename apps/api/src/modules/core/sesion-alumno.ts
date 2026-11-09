// Estado de la sesión de clase del alumno, compartido por la guarda de la API (core) y el módulo alumno.
import type { EstadoDiagnosticos } from "@numotion/core/guardas";
import type { Tx } from "../../infra/db";

/**
 * Estado de los diagnósticos del día del alumno en contexto. El matemático cuenta como
 * hecho cuando ya existe la retroalimentación de la sesión (se genera al finalizarlo).
 */
export async function estadoDiagnosticos(tx: Tx): Promise<EstadoDiagnosticos> {
    const [r] = await tx.$queryRaw<EstadoDiagnosticos[]>`
        SELECT coalesce(bool_or(p.completado_en IS NOT NULL), false) AS panas,
               coalesce(bool_or(r.id IS NOT NULL), false) AS matematico
          FROM sesion_alumno s
          LEFT JOIN panas_resultado p ON p.sesion_id = s.id
          LEFT JOIN retroalimentacion r ON r.sesion_id = s.id
         WHERE s.alumno_id = app_user() AND s.fecha = fn_hoy_local()`;
    return { panas: r.panas, matematico: r.matematico };
}

