import { defineMiddleware } from "astro:middleware";
import { usuarioDeSesion } from "./modules/shared/servidor/auth";
import { areaDeRuta, decidirAcceso } from "./modules/shared/servidor/guardas";
import { error } from "./modules/shared/servidor/http";
import { estadoDiagnosticos } from "./modules/alumno/servidor/diagnostico";
import { fechaLocal } from "./modules/shared/dominio/fechas";

export const onRequest = defineMiddleware(async (ctx, next) => {
    const ruta = ctx.url.pathname.replace(/\/+$/, "") || "/";

    // Recursos estáticos y prerenderizados no necesitan sesión
    if (ruta.startsWith("/_") || ruta.startsWith("/images/") || ruta.includes(".")) return next();

    const usuario = await usuarioDeSesion(ctx.cookies);
    ctx.locals.usuario = usuario;

    const diagnosticos =
        usuario?.rol === "alumno" && areaDeRuta(ruta) === "alumno" && usuario.idAlumno !== undefined
            ? await estadoDiagnosticos(usuario.idAlumno, fechaLocal())
            : null;

    const decision = decidirAcceso(ruta, usuario, diagnosticos);
    switch (decision.tipo) {
        case "permitir": {
            const respuesta = await next();
            if (areaDeRuta(ruta) !== "publica") respuesta.headers.set("Cache-Control", "no-store");
            return respuesta;
        }
        case "redirigir":
            return ctx.redirect(decision.destino, 303);
        case "noAutorizado":
            return error("Inicia sesión para continuar", 401);
        case "prohibido":
            return error("No tienes permiso para este recurso", 403);
    }
});
