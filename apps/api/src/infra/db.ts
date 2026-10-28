// Acceso a PostgreSQL con Prisma y contexto RLS (ADR-003, ADR-012, T-02-08, T-03-01-03).
// Toda consulta corre en una transacción interactiva que fija app.user_id y app.role; la conexión
// usa numotion_app, que no puede saltarse RLS. El esquema de Prisma se genera desde las migraciones
// SQL (`npm run db:pull`): ellas son la fuente de verdad, no Prisma Migrate.
//
// Reglas para $queryRaw (Prisma envía los parámetros string como `text`):
//   · UUID y enums necesitan cast explícito: `${id}::uuid`, `${estado}::estado_asignacion`.
//   · Fechas que llegan como texto: `${valor}::text::date` / `::text::timestamp`.
//   · numeric vuelve como Prisma.Decimal y date como Date: convertir en el servicio.
// Reglas para la API tipada: la app NO puede leer pin_hash, password_hash ni token_hash; en esas
// tablas usa siempre `select` explícito (también en create/update, que por defecto devuelven todo).
import { Prisma, PrismaClient } from "@prisma/client";
import { requerida } from "./entorno";

export type Tx = Prisma.TransactionClient;
export type Contexto = { rol: "docente" | "alumno"; id: string } | null;
export { Prisma };

let cliente: PrismaClient | null = null;

export function crearCliente(url: string): PrismaClient {
    return new PrismaClient({ datasourceUrl: url });
}

function db(): PrismaClient {
    cliente ??= crearCliente(requerida("DATABASE_URL"));
    return cliente;
}

/**
 * Ejecuta fn en una transacción con el contexto del usuario. Con contexto null
 * (login, consentimiento del tutor) RLS no deja ver datos de alumnos: esas rutas
 * usan funciones SECURITY DEFINER.
 */
export async function conContexto<T>(ctx: Contexto, fn: (tx: Tx) => Promise<T>, prisma: PrismaClient = db()): Promise<T> {
    return prisma.$transaction(
        async (tx) => {
            await tx.$queryRaw`SELECT set_config('app.user_id', ${ctx?.id ?? ""}, true), set_config('app.role', ${ctx?.rol ?? ""}, true)`;
            return fn(tx);
        },
        { maxWait: 10_000, timeout: 20_000 },
    );
}

/** Error de PostgreSQL detrás de una excepción de Prisma: código SQLSTATE y mensaje sin el prefijo "ERROR: ". */
export function errorBd(e: unknown): { codigo: string; mensaje: string } | null {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // Raw query failed (P2010): el SQLSTATE viene en meta.code
        if (e.code === "P2010") {
            const meta = e.meta as { code?: string; message?: string } | undefined;
            return { codigo: meta?.code ?? "", mensaje: (meta?.message ?? "").replace(/^ERROR:\s*/, "").split("\n")[0] };
        }
        if (e.code === "P2002") return { codigo: "23505", mensaje: "unique" };
    }
    // Permisos (RLS/columnas) en la API tipada: Prisma no siempre lo clasifica
    if (e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientKnownRequestError) {
        const m = /Code: `(\w+)`\. Message: `(?:ERROR: )?([^`]*)`/.exec(e.message) ?? /code: "?(\w{5})"?/.exec(e.message);
        if (m) return { codigo: m[1], mensaje: m[2] ?? e.message };
        if (/permission denied|row-level security/i.test(e.message)) return { codigo: "42501", mensaje: e.message };
    }
    return null;
}

/** numeric de Postgres (Decimal) → number; null se respeta. */
export const num = (v: Prisma.Decimal | number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
