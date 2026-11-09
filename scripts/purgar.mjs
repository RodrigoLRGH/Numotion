// Retención (RC-07, 01-modelo §6, T-03-05-12): borra evento_emocional con más de 180 días.
// Se ejecuta a diario con el rol dueño (cron del servidor, Vercel Cron o EventBridge en AWS).
// Uso: npm run db:purgar
import postgres from "postgres";

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
    console.error("Falta DATABASE_OWNER_URL (ver .env.example)");
    process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
    const [{ n }] = await sql`SELECT fn_purgar_eventos_emocionales() AS n`;
    console.log(`Eventos emocionales purgados: ${n}`);
} finally {
    await sql.end();
}
