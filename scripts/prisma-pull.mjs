// Regenera apps/api/prisma/schema.prisma desde la BD ya migrada (T-02-08): las migraciones SQL
// son la fuente de verdad y Prisma solo las refleja. Se introspecta con el rol dueño, que ve todo.
// Uso: npm run db:migrar && npm run db:pull
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
    console.error("Falta DATABASE_OWNER_URL (ver .env.example)");
    process.exit(1);
}
const api = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/api");
for (const args of [["prisma", "db", "pull"], ["prisma", "generate"]]) {
    const r = spawnSync("npx", args, { cwd: api, stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: url } });
    if (r.status !== 0) process.exit(r.status ?? 1);
}
