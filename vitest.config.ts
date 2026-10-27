import { defineConfig } from "vitest/config";

// unidad: dominio puro (sin BD). db: PostgreSQL real (docker compose up -d), ver docs/specs/04-pruebas
export default defineConfig({
    test: {
        projects: [
            { test: { name: "unidad", include: ["tests/unidad/**/*.test.ts"], environment: "node" } },
            {
                test: {
                    name: "db",
                    include: ["tests/db/**/*.test.ts"],
                    environment: "node",
                    globalSetup: ["tests/db/setup-global.ts"],
                    // Un solo proceso: las transacciones de distintos archivos no deben competir por bloqueos
                    pool: "forks",
                    poolOptions: { forks: { singleFork: true } },
                    testTimeout: 20_000,
                },
            },
        ],
    },
});
