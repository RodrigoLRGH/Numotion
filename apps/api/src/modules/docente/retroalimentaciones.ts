// Retroalimentaciones de diagnóstico (RF-61, RF-62): una por alumno y día en que hizo el PANAS-C y
// el diagnóstico matemático. Lista por grupo y detalle por tema. Contexto docente: RLS limita a los
// alumnos de sus grupos; una retroalimentación ajena simplemente no existe (null → 404).
import { describirDiagnostico } from "@numotion/core/dominio/descripcion-diagnostico";
import { num, Prisma, type Tx } from "../../infra/db";

export interface RegistroRetro {
    id: string;
    fecha: string;
    alumno: { id: string; nombre: string };
    estadoInicial: string;
}

export async function retroalimentacionesDelGrupo(tx: Tx, grupoId: string): Promise<RegistroRetro[] | null> {
    if (!(await tx.grupo.findUnique({ where: { id: grupoId }, select: { id: true } }))) return null;
    const filas = await tx.$queryRaw<{ id: string; fecha: string; alumno_id: string; nombre: string; estado: string }[]>`
        SELECT r.id, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, a.id AS alumno_id, trim(a.nombre || ' ' || a.apellidos) AS nombre,
               r.estado_inicial::text AS estado
          FROM retroalimentacion r
          JOIN sesion_alumno s ON s.id = r.sesion_id
          JOIN alumno a ON a.id = r.alumno_id
         WHERE a.grupo_id = ${grupoId}::uuid AND a.activo
         ORDER BY s.fecha DESC, a.nombre, a.apellidos
         LIMIT 500`;
    return filas.map((f) => ({ id: f.id, fecha: f.fecha, alumno: { id: f.alumno_id, nombre: f.nombre }, estadoInicial: f.estado }));
}

export interface TemaRetro {
    temaId: string;
    tema: string;
    ejercicios: number;
    aciertos: number;
    errores: number;
    nivelDominio: number;
    tiempoMs: number;
}

export interface DetalleRetro {
    id: string;
    fecha: string;
    alumno: { id: string; nombre: string; grupo: string };
    estadoInicial: string;
    afectoPositivo: number | null;
    afectoNegativo: number | null;
    observaciones: string[];
    descripcion: string[];
    temas: TemaRetro[];
}

export async function detalleRetroalimentacion(tx: Tx, id: string): Promise<DetalleRetro | null> {
    const [r] = await tx.$queryRaw<{
        id: string; sesion_id: string; fecha: string; alumno_id: string; nombre: string; grupo: string; estado: string;
        ap: Prisma.Decimal | null; an: Prisma.Decimal | null; observaciones: string[] | null;
    }[]>`
        SELECT r.id, r.sesion_id, to_char(s.fecha, 'YYYY-MM-DD') AS fecha, a.id AS alumno_id,
               trim(a.nombre || ' ' || a.apellidos) AS nombre, g.nombre AS grupo, r.estado_inicial::text AS estado,
               p.afecto_positivo AS ap, p.afecto_negativo AS an, r.observaciones
          FROM retroalimentacion r
          JOIN sesion_alumno s ON s.id = r.sesion_id
          JOIN alumno a ON a.id = r.alumno_id
          JOIN grupo g ON g.id = a.grupo_id
          LEFT JOIN panas_resultado p ON p.id = r.panas_id
         WHERE r.id = ${id}::uuid`;
    if (!r) return null;
    const temas = await tx.$queryRaw<{ tema_id: string; tema: string; total: number; aciertos: number; nivel: number; tiempo: number }[]>`
        SELECT d.tema_id, t.nombre AS tema, d.total::int AS total, d.aciertos::int AS aciertos, d.nivel_dominio::int AS nivel,
               d.tiempo_total_ms AS tiempo
          FROM diagnostico_mat_resultado d JOIN tema t ON t.id = d.tema_id
         WHERE d.sesion_id = ${r.sesion_id}::uuid
         ORDER BY t.orden, t.nombre`;
    const porTema: TemaRetro[] = temas.map((t) => ({
        temaId: t.tema_id,
        tema: t.tema,
        ejercicios: t.total,
        aciertos: t.aciertos,
        errores: t.total - t.aciertos,
        nivelDominio: t.nivel,
        tiempoMs: t.tiempo,
    }));
    const afectoPositivo = num(r.ap);
    const afectoNegativo = num(r.an);
    const observaciones = r.observaciones ?? [];
    return {
        id: r.id,
        fecha: r.fecha,
        alumno: { id: r.alumno_id, nombre: r.nombre, grupo: r.grupo },
        estadoInicial: r.estado,
        afectoPositivo,
        afectoNegativo,
        observaciones,
        descripcion: describirDiagnostico({ temas: porTema, estadoInicial: r.estado, afectoPositivo, afectoNegativo, observaciones }),
        temas: porTema,
    };
}
