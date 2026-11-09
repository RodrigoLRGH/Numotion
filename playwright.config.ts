import { defineConfig, devices } from "@playwright/test";

// P-E2E / P-A11Y contra el SPA (Vite :5173) y la API (Express :3000).
// Requiere `docker compose up -d` y `npm run db:migrar`.
export default defineConfig({
    testDir: "tests/e2e",
    testMatch: "**/*.e2e.ts",
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: { baseURL: "http://localhost:5173", locale: "es-MX", timezoneId: "America/Tijuana", trace: "retain-on-failure" },
    projects: [
        { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
        { name: "tableta", use: { ...devices["Galaxy Tab S4"], browserName: "chromium" } },
    ],
    webServer: [
        { command: "npm run dev -w @numotion/api", url: "http://localhost:3000/api/v1/auth/sesion", reuseExistingServer: true, timeout: 60_000 },
        { command: "npm run dev -w @numotion/web", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
    ],
});
