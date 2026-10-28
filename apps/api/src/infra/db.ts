// Acceso a PostgreSQL con contexto RLS (ADR-003, ADR-010, T-03-01-03).
// Toda consulta corre dentro de una transacción que fija app.user_id y app.role;
// la conexión usa numotion_app, que no puede saltarse RLS.
import postgres from "postgres";
import { requerida } from "./entorno";

// Fechas como texto: postgres.js convierte con `new Date()` los parámetros que el servidor tipa como
// date/timestamp, y una fecha sin zona se interpreta en la zona LOCAL del proceso (corre horas o días).
// Envíalas como `${valor}::text::timestamp` / `::text::date` para que las convierta PostgreSQL.
export type Tx = postgres.TransactionSql;
export type Contexto = { rol: "docente" | "alumno"; id: string } | null;

let cliente: postgres.Sql | null = null;

export function crearCliente(url: string): postgres.Sql {
    // prepare: false para funcionar detrás de poolers en modo transacción (Neon, Supabase)
    return postgres(url, { max: 5, idle_timeout: 20, prepare: false, onnotice: () => {} });
}

function db(): postgres.Sql {
    if (cliente) return cliente;
    cliente = crearCliente(requerida("DATABASE_URL"));
    return cliente;
}

/**
 * Ejecuta fn en una transacción con el contexto del usuario. Con contexto null
 * (login, consentimiento del tutor) RLS no deja ver datos de alumnos: esas rutas
 * usan funciones SECURITY DEFINER.
 */
export async function conContexto<T>(ctx: Contexto, fn: (tx: Tx) => Promise<T>, sql: postgres.Sql = db()): Promise<T> {
    return (await sql.begin(async (tx) => {
        await tx`SELECT set_config('app.user_id', ${ctx?.id ?? ""}, true), set_config('app.role', ${ctx?.rol ?? ""}, true)`;
        return fn(tx);
    })) as T;
}
