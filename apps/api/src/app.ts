// Aplicación Express de la API (ADR-001: módulos docente, alumno y core; ADR-008).
// Orden: cabeceras → cuerpo/cookies → sesión → guarda por rol y diagnósticos → rutas → errores.
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { decidirAcceso, type EstadoDiagnosticos } from "@numotion/core/guardas";
import { conContexto } from "./infra/db";
import { esProduccion } from "./infra/entorno";
import { rutasAlumno } from "./modules/alumno/rutas";
import { tokenDeCookies, usuarioDeToken } from "./modules/core/auth";
import { cabecerasSeguridad } from "./modules/core/cabeceras";
import { contextoDe, enviarError, intermedio, manejadorErrores, usuarioDe } from "./modules/core/http";
import { rutasCore } from "./modules/core/rutas";
import { estadoDiagnosticos } from "./modules/core/sesion-alumno";
import { rutasDocente } from "./modules/docente/rutas";

export function crearApp(): Express {
    const app = express();
    app.disable("x-powered-by");
    // Detrás del proxy de Vite (desarrollo) o de Vercel: req.ip y el protocolo vienen del proxy
    app.set("trust proxy", 1);

    const cabeceras = cabecerasSeguridad(esProduccion());
    app.use((_req, res, next) => {
        for (const [k, v] of Object.entries(cabeceras)) res.setHeader(k, v);
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    app.use(express.json({ limit: "100kb" }));
    app.use(cookieParser());

    // Sesión: resuelve el usuario de la cookie (o null)
    app.use("/api/v1", intermedio(async (req, res) => {
        res.locals.usuario = await usuarioDeToken(tokenDeCookies(req));
    }));

    // Guarda por rol y compuerta de diagnósticos del día (RNF-04, RF-63)
    app.use("/api/v1", intermedio(async (req, res) => {
        const ruta = req.baseUrl + req.path;
        const usuario = usuarioDe(res);
        let diagnosticos: EstadoDiagnosticos | null = null;
        if (usuario?.rol === "alumno" && ruta.startsWith("/api/v1/alumno/")) {
            diagnosticos = await conContexto(contextoDe(usuario), estadoDiagnosticos);
        }
        const decision = decidirAcceso(ruta, usuario, diagnosticos);
        if (decision.tipo === "noAutorizado") enviarError(res, "NO_AUTENTICADO", "Inicia sesión para continuar", 401);
        else if (decision.tipo === "prohibido") enviarError(res, "PROHIBIDO", "No tienes permiso para este recurso", 403);
        else if (decision.tipo === "diagnosticosPendientes") enviarError(res, "DIAGNOSTICOS_PENDIENTES", "Primero completa los diagnósticos de hoy", 403);
    }));

    app.use("/api/v1", rutasCore);
    app.use("/api/v1/docente", rutasDocente);
    app.use("/api/v1/alumno", rutasAlumno);
    app.use("/api", (_req, res) => enviarError(res, "NO_ENCONTRADO", "Ruta no encontrada", 404));
    app.use(manejadorErrores);
    return app;
}
