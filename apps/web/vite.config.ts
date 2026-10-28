import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA (ADR-008). En desarrollo /api va al Express local; en producción el mismo origen lo enruta a la API.
const API = process.env.API_URL ?? "http://localhost:3000";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true, proxy: { "/api": { target: API, changeOrigin: false } } },
    preview: { port: 4173, strictPort: true, proxy: { "/api": { target: API, changeOrigin: false } } },
    build: { outDir: "dist", sourcemap: true },
});
