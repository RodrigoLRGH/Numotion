import { defineConfig, devices } from "@playwright/test";

// P-E2E / P-A11Y contra `npm run dev` (requiere `docker compose up -d` y `npm run db:migrar`)
export default defineConfig({
    testDir: "tests/e2e",
    testMatch: "**/*.e2e.ts",
    fullyParallel: false,
    workers: 1,
    reporter: [["list"]],
    use: { baseURL: "http://localhost:4321", locale: "es-MX", timezoneId: "America/Tijuana", trace: "retain-on-failure" },
    projects: [
        { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
        { name: "tableta", use: { ...devices["Galaxy Tab S4"], browserName: "chromium" } },
    ],
    webServer: { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: true, timeout: 60_000 },
});
