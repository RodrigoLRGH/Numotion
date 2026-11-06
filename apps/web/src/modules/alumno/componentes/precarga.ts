// Carga diferida de la pantalla de actividad (T-03-04-21). Una sola promesa: precargar desde
// "Mis actividades" y abrir la actividad reutilizan la misma descarga.
let resolver: Promise<typeof import("./ResolverActividad")> | null = null;

export function cargarResolver() {
    resolver ??= import("./ResolverActividad").catch((e) => {
        resolver = null; // sin conexión: se reintenta al abrir la actividad
        throw e;
    });
    return resolver;
}

/** Descarga el trozo cuando el navegador está libre, sin competir con la pantalla actual. */
export function precargarResolver(): () => void {
    const precargar = () => void cargarResolver().catch(() => {});
    if (typeof window.requestIdleCallback === "function") {
        const id = window.requestIdleCallback(precargar, { timeout: 2000 });
        return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(precargar, 300);
    return () => window.clearTimeout(id);
}
