import { defineConfig } from "vitest/config";

// unidad: dominio puro (sin BD). componentes: islas React en jsdom. db: PostgreSQL real (docker compose up -d), ver docs/specs/04-pruebas
export default defineConfig({
    test: {
        projects: [
            { test: { name: "unidad", include: ["tests/unidad/**/*.test.ts"], environment: "node" } },
            {
                // P-COMP: islas React con Testing Library
                esbuild: { jsx: "automatic" },
                test: { name: "componentes", include: ["tests/componentes/**/*.test.tsx"], environment: "jsdom", setupFiles: ["tests/componentes/setup.ts"] },
            },
            {
                test: {
                    name: "db",
                    include: ["tests/db/**/*.test.ts", "tests/api/**/*.test.ts"],
                    environment: "node",
                    globalSetup: ["tests/db/setup-global.ts"],
                    // Los servicios se conectan como la app (numotion_app) a la base de pruebas
                    env: { DATABASE_URL: "postgres://numotion_app:numotion_app@localhost:5433/numotion_test", CORREO_PROVEEDOR: "memoria" },
                    // Un solo proceso: las transacciones de distintos archivos no deben competir por bloqueos
                    pool: "forks",
                    poolOptions: { forks: { singleFork: true } },
                    testTimeout: 20_000,
                },
            },
        ],
    },
});
