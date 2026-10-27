// POST /api/v1/auth/logout: invalida la sesión en BD, no solo la cookie
import type { APIRoute } from "astro";
import { borrarCookieSesion, cerrarSesionToken, tokenDeCookies } from "../../../../modules/shared/servidor/auth";

export const POST: APIRoute = async ({ cookies }) => {
    await cerrarSesionToken(tokenDeCookies(cookies));
    borrarCookieSesion(cookies);
    return new Response(null, { status: 204 });
};
