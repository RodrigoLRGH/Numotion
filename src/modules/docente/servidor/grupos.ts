// Grupos y alumnos del docente (RNF-04, ADR-004, ADR-009). RLS ya limita todo a los grupos
// del docente en contexto; un grupo ajeno simplemente "no existe" (404).
import { avatarDisponible, esAvatar, generarCodigoAcceso, pinAleatorio, pinATexto } from "../../shared/dominio/acceso";
import { hashSecreto, nuevoToken } from "../../shared/servidor/auth";
import type { EstadoConsentimiento } from "../../shared/dominio/consentimiento";
import { VIGENCIA_INVITACION_MS } from "../../shared/servidor/consentimiento";
import type { Tx } from "../../shared/servidor/db";


export interface GrupoResumen {
    id: string;
    nombre: string;
    grado: number;
    cicloEscolar: string;
    codigoAcceso: string;
    alumnos: number;
}

export async function gruposDelDocente(tx: Tx): Promise<GrupoResumen[]> {
    return tx<GrupoResumen[]>`
        SELECT g.id, g.nombre, g.grado, g.ciclo_escolar AS "cicloEscolar", g.codigo_acceso AS "codigoAcceso",
               count(a.id)::int AS alumnos
          FROM grupo g LEFT JOIN alumno a ON a.grupo_id = g.id AND a.activo
         GROUP BY g.id ORDER BY g.ciclo_escolar DESC, g.nombre`;
}

export async function crearGrupo(
    tx: Tx,
    docenteId: string,
    datos: { nombre: string; grado: number; cicloEscolar: string },
): Promise<GrupoResumen> {
    // El código es aleatorio; ante una colisión (UNIQUE) se reintenta con otro
    for (let intento = 0; ; intento++) {
        const codigo = generarCodigoAcceso(Math.random);
        try {
            const [g] = await tx.savepoint((sp) => sp<GrupoResumen[]>`
                INSERT INTO grupo (docente_id, nombre, grado, ciclo_escolar, codigo_acceso)
                VALUES (${docenteId}, ${datos.nombre}, ${datos.grado}, ${datos.cicloEscolar}, ${codigo})
                RETURNING id, nombre, grado, ciclo_escolar AS "cicloEscolar", codigo_acceso AS "codigoAcceso", 0 AS alumnos`);
            return g;
        } catch (e) {
            if (intento >= 4 || (e as { code?: string }).code !== "23505") throw e;
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
    const [g] = await tx`SELECT id FROM grupo WHERE id = ${grupoId}`;
    if (!g) return null;
    return tx<AlumnoDeGrupo[]>`
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
         WHERE a.grupo_id = ${grupoId}
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

    const [aviso] = await tx`SELECT version FROM aviso_privacidad WHERE vigente_desde <= now() ORDER BY vigente_desde DESC LIMIT 1`;
    if (!aviso) throw new Error("No hay un aviso de privacidad vigente (aviso_privacidad vacío)");

    const [alumno] = await tx`
        INSERT INTO alumno (grupo_id, nombre, apellidos, avatar, pin_hash, intereses)
        VALUES (${grupoId}, ${d.nombre}, ${d.apellidos}, ${avatar}, ${await hashSecreto(pinTexto)}, ${d.intereses ?? []})
        RETURNING id, nombre, avatar`;

    const { token, hash } = nuevoToken();
    const expira = new Date(Date.now() + VIGENCIA_INVITACION_MS);
    await tx`
        INSERT INTO consentimiento_tutor (alumno_id, tutor_nombre, tutor_email, version_aviso, token_hash, token_expira_en)
        VALUES (${alumno.id}, ${d.tutorNombre}, ${d.tutorEmail}, ${aviso.version}, ${hash}, ${expira})`;

    return { ok: true, alumno: { id: alumno.id, nombre: alumno.nombre, avatar: alumno.avatar }, pin, invitacion: { token, expira } };
}
