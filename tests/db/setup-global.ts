// Recrea la base de pruebas y aplica todas las migraciones antes de la corrida.
import postgres from "postgres";
import { migrar } from "../../scripts/migrar.mjs";

export const URL_PRUEBAS =
    process.env.TEST_DATABASE_OWNER_URL ?? "postgres://numotion_owner:numotion_owner@localhost:5433/numotion_test";

export default async function setup() {
    const url = new URL(URL_PRUEBAS);
    const nombre = url.pathname.slice(1);
    url.pathname = "/postgres";
    const admin = postgres(url.toString(), { max: 1, onnotice: () => {} });
    try {
        await admin.unsafe(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
        await admin.unsafe(`CREATE DATABASE "${nombre}"`);
    } finally {
        await admin.end();
    }
    // El rol es global al servidor: se le fija la contraseña que usa tests/db/contexto.test.ts
    await migrar(URL_PRUEBAS, { seed: false, passwordApp: process.env.NUMOTION_APP_PASSWORD ?? "numotion_app" });
}
