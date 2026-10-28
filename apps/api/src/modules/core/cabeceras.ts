// Cabeceras de seguridad (RI-09, T-03-01-16, 03-seguridad §7).
// script-src admite 'unsafe-inline' porque Astro inserta scripts en línea para hidratar islas;
// se endurecerá con hashes cuando se active la CSP nativa de Astro.

export function cabecerasSeguridad(produccion: boolean): Record<string, string> {
    const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join("; ");
    return {
        "Content-Security-Policy": csp,
        "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "X-Frame-Options": "DENY",
        ...(produccion ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    };
}
