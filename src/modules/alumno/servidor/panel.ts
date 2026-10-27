// Panel principal del alumno (RF-63..RF-66), perfil (RF-65) y práctica libre.
import {
    Actividad,
    Alumno,
    AsignacionAlumno,
    and,
    db,
    desc,
    eq,
    Grupo,
    InsigniaAlumno,
    SesionPractica,
    Tema,
    Usuario,
} from "astro:db";
import { fechaLocal } from "../../shared/dominio/fechas";
import { rachaVigente } from "../../shared/dominio/racha";
import { nivelGamificacion, insigniaPorClave, type Insignia } from "../../shared/dominio/gamificacion";
import { fraseMotivacional } from "../../shared/dominio/motivacion";
import { balancePanas } from "../../shared/dominio/panas";
import { elegir } from "../../shared/dominio/aleatorio";
import { temaPorClave, type TipoInteraccion } from "../../shared/dominio/ejercicios";
import { nivelInicialPara, ultimoPanas } from "../../shared/servidor/consultas";

export async function perfilAlumno(idAlumno: number) {
    const [f] = await db
        .select({ alumno: Alumno, usuario: Usuario, grupo: Grupo })
        .from(Alumno)
        .innerJoin(Usuario, eq(Alumno.id_usuario, Usuario.id))
        .innerJoin(Grupo, eq(Alumno.id_grupo, Grupo.id))
        .where(eq(Alumno.id, idAlumno))
        .limit(1);
    if (!f) return null;
    const hoy = fechaLocal();
    const insignias = await db
        .select()
        .from(InsigniaAlumno)
        .where(eq(InsigniaAlumno.id_alumno, idAlumno))
        .orderBy(desc(InsigniaAlumno.otorgada_en));
    return {
        nombre: f.usuario.nombre,
        grado: f.alumno.grado,
        grupo: f.grupo.nombre,
        puntos: f.alumno.puntos,
        gamificacion: nivelGamificacion(f.alumno.puntos),
        racha: rachaVigente(
            { racha_actual: f.alumno.racha_actual, mejor_racha: f.alumno.mejor_racha, ultima_fecha_racha: f.alumno.ultima_fecha_racha ?? null },
            hoy,
        ),
        mejorRacha: f.alumno.mejor_racha,
        insignias: insignias
            .map((i) => insigniaPorClave(i.clave))
            .filter((i): i is Insignia => Boolean(i)),
    };
}

export async function actividadesAsignadas(idAlumno: number) {
    const filas = await db
        .select({ a: AsignacionAlumno, act: Actividad, tema: Tema })
        .from(AsignacionAlumno)
        .innerJoin(Actividad, eq(AsignacionAlumno.id_actividad, Actividad.id))
        .innerJoin(Tema, eq(Actividad.id_tema, Tema.id))
        .where(eq(AsignacionAlumno.id_alumno, idAlumno))
        .orderBy(desc(Actividad.fecha_asignacion));
    const orden = { en_curso: 0, pendiente: 1, completada: 2 } as const;
    return filas
        .map((f) => ({
            id: f.a.id,
            nombre: f.act.nombre,
            tema: f.tema.nombre,
            emoji: temaPorClave(f.tema.clave)?.emoji ?? "📘",
            interaccion: f.act.tipo_interaccion,
            fechaAsignacion: f.act.fecha_asignacion,
            estado: f.a.estado as keyof typeof orden,
            resueltos: f.a.ejercicios_resueltos,
            total: f.act.num_ejercicios,
            puntaje: f.a.puntaje ?? null,
        }))
        .sort((x, y) => orden[x.estado] - orden[y.estado]);
}

export async function fraseDelDia(idAlumno: number, nombre: string): Promise<string> {
    const hoy = fechaLocal();
    const panas = await ultimoPanas(idAlumno);
    const balance = panas && panas.fecha_sesion === hoy ? balancePanas(panas) : null;
    return fraseMotivacional(nombre, balance, hoy);
}

/** Crea una sesión de práctica libre en el tema; reanuda la última si quedó abierta. */
export async function iniciarPractica(idAlumno: number, claveTema: string): Promise<number | null> {
    const def = temaPorClave(claveTema);
    if (!def) return null;
    const [tema] = await db.select().from(Tema).where(eq(Tema.clave, claveTema)).limit(1);
    if (!tema) return null;

    const [ultima] = await db
        .select()
        .from(SesionPractica)
        .where(and(eq(SesionPractica.id_alumno, idAlumno), eq(SesionPractica.id_tema, tema.id)))
        .orderBy(desc(SesionPractica.id))
        .limit(1);
    if (ultima && !ultima.completada_en) return ultima.id;

    const nivel = ultima ? ultima.nivel_actual : await nivelInicialPara(idAlumno, claveTema);
    const interaccion: TipoInteraccion = elegir(Math.random, def.interacciones);
    const [nueva] = await db
        .insert(SesionPractica)
        .values({ id_alumno: idAlumno, id_tema: tema.id, tipo_interaccion: interaccion, nivel_actual: nivel, total_objetivo: 5 })
        .returning({ id: SesionPractica.id });
    return nueva.id;
}
