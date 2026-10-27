import { defineMiddleware } from "astro:middleware";
import { tokenDeCookies, usuarioDeToken } from "./modules/shared/servidor/auth";
import { cabecerasSeguridad } from "./modules/shared/servidor/cabeceras";
import { conContexto } from "./modules/shared/servidor/db";
import { areaDeRuta, decidirAcceso, type DecisionAcceso } from "./modules/shared/servidor/guardas";
import { contextoDe, error } from "./modules/shared/servidor/http";
import { estadoDiagnosticos } from "./modules/alumno/servidor/diagnostico";

const CABECERAS = cabecerasSeguridad(import.meta.env.PROD);

function conCabeceras(respuesta: Response, privada: boolean): Response {
    for (const [k, v] of Object.entries(CABECERAS)) respuesta.headers.set(k, v);
    if (privada) respuesta.headers.set("Cache-Control", "no-store");
    return respuesta;
}

async function responder(decision: DecisionAcceso, ctx: Parameters<Parameters<typeof defineMiddleware>[0]>[0], next: () => Promise<Response>) {
    switch (decision.tipo) {
        case "permitir":
            return next();
        case "redirigir":
            return ctx.redirect(decision.destino, 303);
        case "noAutorizado":
            return error("NO_AUTENTICADO", "Inicia sesión para continuar", 401);
        case "prohibido":
            return error("PROHIBIDO", "No tienes permiso para este recurso", 403);
        case "diagnosticosPendientes":
            return error("DIAGNOSTICOS_PENDIENTES", "Primero completa los diagnósticos de hoy", 403);
    }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
    const ruta = ctx.url.pathname.replace(/\/+$/, "") || "/";

    // Recursos estáticos no necesitan sesión
    if (ruta.startsWith("/_") || ruta.startsWith("/images/") || /\.[a-z0-9]+$/i.test(ruta)) return next();

    const usuario = await usuarioDeToken(tokenDeCookies(ctx.cookies));
    ctx.locals.usuario = usuario;

    const diagnosticos =
        usuario?.rol === "alumno" && areaDeRuta(ruta) === "alumno"
            ? await conContexto(contextoDe(usuario), estadoDiagnosticos)
            : null;

    const respuesta = await responder(decidirAcceso(ruta, usuario, diagnosticos), ctx, next);
    return conCabeceras(respuesta, areaDeRuta(ruta) !== "publica" || ruta.startsWith("/api/"));
});
