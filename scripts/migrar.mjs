// Aplica db/migrations/*.sql en orden, una sola vez cada una (ADR-010).
// Uso: npm run db:migrar            → DATABASE_OWNER_URL
//      npm run db:migrar -- --seed  → además aplica db/seed/*.sql (datos de demostración)
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function archivosSql(dir) {
    try {
        return (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    } catch {
        return [];
    }
}

/** Aplica las migraciones pendientes. Devuelve los nombres aplicados. */
export async function migrar(url, { seed = false, passwordApp = process.env.NUMOTION_APP_PASSWORD } = {}) {
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    const aplicadas = [];
    try {
        await sql`CREATE TABLE IF NOT EXISTS schema_migracion (nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`;
        const hechas = new Set((await sql`SELECT nombre FROM schema_migracion`).map((r) => r.nombre));
        const dirs = [["db/migrations", ""], ...(seed ? [["db/seed", "seed/"]] : [])];
        for (const [dir, prefijo] of dirs) {
            for (const archivo of await archivosSql(path.join(raiz, dir))) {
                const nombre = prefijo + archivo;
                if (hechas.has(nombre)) continue;
                const contenido = await readFile(path.join(raiz, dir, archivo), "utf8");
                await sql.begin(async (tx) => {
                    await tx.unsafe(contenido);
                    await tx`INSERT INTO schema_migracion (nombre) VALUES (${nombre})`;
                });
                aplicadas.push(nombre);
            }
        }
        if (passwordApp) await sql.unsafe(`ALTER ROLE numotion_app PASSWORD '${passwordApp.replaceAll("'", "''")}'`);
    } finally {
        await sql.end();
    }
    return aplicadas;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const url = process.env.DATABASE_OWNER_URL;
    if (!url) {
        console.error("Falta DATABASE_OWNER_URL (ver .env.example)");
        process.exit(1);
    }
    migrar(url, { seed: process.argv.includes("--seed") })
        .then((a) => console.log(a.length ? `Aplicadas: ${a.join(", ")}` : "Sin migraciones pendientes"))
        .catch((e) => {
            console.error(e.message);
            process.exit(1);
        });
}
