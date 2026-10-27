// POST /api/v1/auth/logout: invalida la sesión en BD, no solo la cookie.
// Desde el formulario del encabezado (sin JS) redirige al inicio; desde fetch responde 204.
import type { APIRoute } from "astro";
import { borrarCookieSesion, cerrarSesionToken, tokenDeCookies } from "../../../../modules/shared/servidor/auth";

export const POST: APIRoute = async ({ cookies, request, redirect }) => {
    await cerrarSesionToken(tokenDeCookies(cookies));
    borrarCookieSesion(cookies);
    const esFormulario = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded");
    return esFormulario ? redirect("/", 303) : new Response(null, { status: 204 });
};
