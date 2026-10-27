// Utilidades para pruebas de BD: transacción revertida, cambio de rol y datos base.
import postgres from "postgres";
import { afterAll } from "vitest";

const url = process.env.TEST_DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion_test";
export const sql = postgres(url, { max: 4, onnotice: () => {} });
afterAll(() => sql.end());

export type Tx = postgres.TransactionSql;

class Revertir extends Error {}

/** Ejecuta la prueba dentro de una transacción que siempre se revierte. */
export async function enTransaccion(fn: (tx: Tx) => Promise<void>): Promise<void> {
    try {
        await sql.begin(async (tx) => {
            await fn(tx);
            throw new Revertir();
        });
    } catch (e) {
        if (!(e instanceof Revertir)) throw e;
    }
}

/** Cambia a numotion_app con el contexto dado (como lo hará withContext en la app). */
export async function comoApp(tx: Tx, rol: "docente" | "alumno" | null, id: string | null) {
    await tx`RESET ROLE`;
    await tx`SELECT set_config('app.user_id', ${id ?? ""}, true), set_config('app.role', ${rol ?? ""}, true)`;
    await tx`SET LOCAL ROLE numotion_app`;
}

/** Vuelve al rol dueño (para preparar datos o verificar sin RLS). */
export async function comoDueno(tx: Tx) {
    await tx`RESET ROLE`;
}

/** Ejecuta fn dentro de un SAVEPOINT y devuelve el error (o null) sin abortar la transacción. */
export async function capturarError(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<postgres.PostgresError | null> {
    try {
        await tx.savepoint(async (sp) => {
            await fn(sp as unknown as Tx);
        });
        return null;
    } catch (e) {
        if (e instanceof postgres.PostgresError) return e;
        throw e;
    }
}

export const IDS = {
    docenteA: "00000000-0000-0000-0000-00000000d0a0",
    docenteB: "00000000-0000-0000-0000-00000000d0b0",
    grupoA: "00000000-0000-0000-0000-0000000000a0",
    grupoB: "00000000-0000-0000-0000-0000000000b0",
    alumnoA1: "00000000-0000-0000-0000-0000000000a1",
    alumnoA2: "00000000-0000-0000-0000-0000000000a2",
    alumnoB1: "00000000-0000-0000-0000-0000000000b1",
    temaSuma: "00000000-0000-0000-0000-00000000e001",
    temaResta: "00000000-0000-0000-0000-00000000e002",
} as const;

/** Datos base: 2 docentes con un grupo cada uno, 3 alumnos con consentimiento, 2 temas. */
export async function crearFixture(tx: Tx) {
    await comoDueno(tx);
    await tx`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad')
             ON CONFLICT (version) DO NOTHING`;
    await tx`INSERT INTO docente (id, nombre, email, password_hash) VALUES
        (${IDS.docenteA}, 'Docente A', 'a@escuela.mx', 'x'), (${IDS.docenteB}, 'Docente B', 'b@escuela.mx', 'x')`;
    await tx`INSERT INTO grupo (id, docente_id, nombre, grado, ciclo_escolar, codigo_acceso) VALUES
        (${IDS.grupoA}, ${IDS.docenteA}, '3A', 3, '2026-2027', 'AAA111'),
        (${IDS.grupoB}, ${IDS.docenteB}, '3B', 3, '2026-2027', 'BBB222')`;
    await tx`INSERT INTO alumno (id, grupo_id, nombre, avatar, pin_hash) VALUES
        (${IDS.alumnoA1}, ${IDS.grupoA}, 'Ana', 'gato', 'pin'),
        (${IDS.alumnoA2}, ${IDS.grupoA}, 'Beto', 'perro', 'pin'),
        (${IDS.alumnoB1}, ${IDS.grupoB}, 'Caro', 'gato', 'pin')`;
    await tx`INSERT INTO consentimiento_tutor (alumno_id, tutor_nombre, tutor_email, version_aviso,
               acepta_plataforma, acepta_camara, aceptado_en, token_hash, token_expira_en)
             SELECT id, 'Tutor', 't@correo.mx', 'v1', true, true, now(), 'tok-' || id, now() + interval '7 days'
               FROM alumno WHERE id IN (${IDS.alumnoA1}, ${IDS.alumnoA2}, ${IDS.alumnoB1})`;
    await tx`INSERT INTO tema (id, clave, nombre, orden) VALUES
        (${IDS.temaSuma}, 'suma', 'Suma', 1), (${IDS.temaResta}, 'resta', 'Resta', 2)`;
}

export async function crearEjercicio(tx: Tx, tema: string = IDS.temaSuma, nivel = 2): Promise<string> {
    const [e] = await tx`INSERT INTO ejercicio (tema_id, tipo_interaccion, nivel, enunciado, respuesta, pasos_solucion)
        VALUES (${tema}, 'seleccion_multiple', ${nivel}, '{"texto":"1+1"}', '{"valor":2}',
                '[{"orden":1,"texto":"a"},{"orden":2,"texto":"b"}]') RETURNING id`;
    return e.id;
}

export async function crearSesion(tx: Tx, alumno: string, fecha = "2026-10-27"): Promise<string> {
    const [s] = await tx`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${alumno}, ${fecha}) RETURNING id`;
    return s.id;
}
