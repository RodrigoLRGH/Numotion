import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// SPA (ADR-008). En desarrollo /api va al Express local; en producción el mismo origen lo enruta a la API.
const API = process.env.API_URL ?? "http://localhost:3000";

// Trozos con nombre (T-03-04-21): React y el router en "vendor" (cambian poco y se quedan en caché
// entre despliegues) y los módulos por rol con su nombre, para poder comprobar que el alumno nunca
// descarga código del docente (P-PERF-01 auxiliar).
const VENDOR = /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/;
const MODULO = /[\\/]src[\\/]modules[\\/](docente|alumno|admin|publico)[\\/]/;

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: { port: 5173, strictPort: true, proxy: { "/api": { target: API, changeOrigin: false } } },
    preview: { port: 4173, strictPort: true, proxy: { "/api": { target: API, changeOrigin: false } } },
    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: (id) => (VENDOR.test(id) ? "vendor" : undefined),
                chunkFileNames: (chunk) => {
                    const modulo = chunk.facadeModuleId ? MODULO.exec(chunk.facadeModuleId)?.[1] : undefined;
                    return modulo ? `assets/${modulo}-[name]-[hash].js` : "assets/[name]-[hash].js";
                },
            },
        },
    },
});
