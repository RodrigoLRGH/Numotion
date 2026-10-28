// Grupos y alumnos del docente (RNF-04, ADR-004, ADR-009). RLS ya limita todo a los grupos
// del docente en contexto; un grupo ajeno simplemente "no existe" (404).
import { avatarDisponible, esAvatar, generarCodigoAcceso, pinAleatorio, pinATexto } from "@numotion/core/dominio/acceso";
import type { EstadoConsentimiento } from "@numotion/core/dominio/consentimiento";
import { errorBd, type Tx } from "../../infra/db";
import { hashSecreto, nuevoToken } from "../core/auth";
import { VIGENCIA_INVITACION_MS } from "../core/consentimiento";

export interface GrupoResumen {
    id: string;
    nombre: string;
    grado: number;
    cicloEscolar: string;
    codigoAcceso: string;
    alumnos: number;
}

const columnasGrupo = { id: true, nombre: true, grado: true, ciclo_escolar: true, codigo_acceso: true } as const;

function aResumen(g: { id: string; nombre: string; grado: number; ciclo_escolar: string; codigo_acceso: string }, alumnos: number): GrupoResumen {
    return { id: g.id, nombre: g.nombre, grado: g.grado, cicloEscolar: g.ciclo_escolar, codigoAcceso: g.codigo_acceso, alumnos };
}

export async function gruposDelDocente(tx: Tx): Promise<GrupoResumen[]> {
    const grupos = await tx.grupo.findMany({
        select: { ...columnasGrupo, _count: { select: { alumno: { where: { activo: true } } } } },
        orderBy: [{ ciclo_escolar: "desc" }, { nombre: "asc" }],
    });
    return grupos.map((g) => aResumen(g, g._count.alumno));
}

export async function crearGrupo(
    tx: Tx,
    docenteId: string,
    datos: { nombre: string; grado: number; cicloEscolar: string },
): Promise<GrupoResumen> {
    // El código es aleatorio; ante una colisión (UNIQUE) se reintenta con otro. Prisma no expone
    // savepoints en transacciones interactivas: se usan explícitos para no abortar la transacción.
    for (let intento = 0; ; intento++) {
        await tx.$executeRaw`SAVEPOINT crear_grupo`;
        try {
            const g = await tx.grupo.create({
                data: { docente_id: docenteId, nombre: datos.nombre, grado: datos.grado, ciclo_escolar: datos.cicloEscolar, codigo_acceso: generarCodigoAcceso(Math.random) },
                select: columnasGrupo,
            });
            await tx.$executeRaw`RELEASE SAVEPOINT crear_grupo`;
            return aResumen(g, 0);
        } catch (e) {
            await tx.$executeRaw`ROLLBACK TO SAVEPOINT crear_grupo`;
            if (intento >= 4 || errorBd(e)?.codigo !== "23505") throw e;
        }
    }
}

export interface AlumnoDeGrupo {
    id: string;
    nombre: string;
    apellidos: string;
    avatar: string;
    activo: boolean;
    estadoConsentimiento: EstadoConsentimiento;
    aceptaCamara: boolean;
}

/** null si el grupo no existe o es de otro docente. */
export async function alumnosDelGrupo(tx: Tx, grupoId: string): Promise<AlumnoDeGrupo[] | null> {
    const grupo = await tx.grupo.findUnique({ where: { id: grupoId }, select: { id: true } });
    if (!grupo) return null;
    // Estado del último consentimiento frente a la versión vigente del aviso: más claro en SQL
    return tx.$queryRaw<AlumnoDeGrupo[]>`
        SELECT a.id, a.nombre, a.apellidos, a.avatar, a.activo,
               CASE WHEN c.revocado_en IS NOT NULL THEN 'revocado'
                    WHEN c.id IS NULL OR (c.aceptado_en IS NULL AND c.token_expira_en > now()) THEN 'pendiente'
                    WHEN c.aceptado_en IS NULL THEN 'vencido'
                    WHEN c.version_aviso <> v.version THEN 'por_renovar'
                    ELSE 'vigente' END AS "estadoConsentimiento",
               coalesce(c.acepta_camara AND c.revocado_en IS NULL, false) AS "aceptaCamara"
          FROM alumno a
          LEFT JOIN LATERAL (SELECT ct.id, ct.aceptado_en, ct.revocado_en, ct.version_aviso, ct.acepta_camara, ct.token_expira_en
                               FROM consentimiento_tutor ct WHERE ct.alumno_id = a.id
                              ORDER BY ct.creado_en DESC LIMIT 1) c ON true
          LEFT JOIN LATERAL (SELECT version FROM aviso_privacidad WHERE vigente_desde <= now()
                              ORDER BY vigente_desde DESC LIMIT 1) v ON true
         WHERE a.grupo_id = ${grupoId}::uuid
         ORDER BY a.nombre, a.apellidos`;
}

export interface DatosAlumnoNuevo {
    nombre: string;
    apellidos: string;
    avatar?: string;
    pin?: string[];
    tutorNombre: string;
    tutorEmail: string;
    intereses?: string[];
}

export type AltaAlumno =
    | {
          ok: true;
          alumno: { id: string; nombre: string; avatar: string };
          /** Se muestra una sola vez al docente para que se lo entregue al alumno */
          pin: string[];
          invitacion: { token: string; expira: Date };
      }
    | { ok: false; status: 404 | 409 | 422; message: string };

export async function crearAlumno(tx: Tx, grupoId: string, d: DatosAlumnoNuevo): Promise<AltaAlumno> {
    const usados = await alumnosDelGrupo(tx, grupoId);
    if (!usados) return { ok: false, status: 404, message: "Grupo no encontrado" };

    const avatar = d.avatar ?? avatarDisponible(usados.map((a) => a.avatar));
    if (!avatar || !esAvatar(avatar)) return { ok: false, status: 422, message: "No hay un avatar disponible válido" };
    if (usados.some((a) => a.avatar === avatar)) return { ok: false, status: 409, message: "Ese avatar ya lo usa otro alumno del grupo" };

    const pin = d.pin ?? pinAleatorio(Math.random);
    const pinTexto = pinATexto(pin);
    if (!pinTexto) return { ok: false, status: 422, message: "El PIN debe tener 4 íconos del catálogo" };

    const aviso = await tx.aviso_privacidad.findFirst({ where: { vigente_desde: { lte: new Date() } }, orderBy: { vigente_desde: "desc" }, select: { version: true } });
    if (!aviso) throw new Error("No hay un aviso de privacidad vigente (aviso_privacidad vacío)");

    // SQL y no alumno.create: Prisma añadiría los valores por defecto del esquema (activo, intentos_fallidos,
    // creado_en) al INSERT, y la app solo tiene permiso de INSERT sobre las columnas de abajo (0004_rls)
    const [alumno] = await tx.$queryRaw<{ id: string; nombre: string; avatar: string }[]>`
        INSERT INTO alumno (grupo_id, nombre, apellidos, avatar, pin_hash, intereses)
        VALUES (${grupoId}::uuid, ${d.nombre}, ${d.apellidos}, ${avatar}, ${await hashSecreto(pinTexto)}, ${d.intereses ?? []}::text[])
        RETURNING id, nombre, avatar`;

    const { token, hash } = nuevoToken();
    const expira = new Date(Date.now() + VIGENCIA_INVITACION_MS);
    // Igual que arriba: el docente no puede fijar acepta_plataforma/acepta_camara (solo el tutor, por función)
    await tx.$executeRaw`
        INSERT INTO consentimiento_tutor (alumno_id, tutor_nombre, tutor_email, version_aviso, token_hash, token_expira_en)
        VALUES (${alumno.id}::uuid, ${d.tutorNombre}, ${d.tutorEmail}::citext, ${aviso.version}, ${hash}, ${expira})`;

    return { ok: true, alumno, pin, invitacion: { token, expira } };
}
