// Rutas públicas y de sesión: autenticación (EXP-01.2), sesión para el SPA, consentimiento del
// tutor (RC-08, RNF-10, T-03-01-10, 05-contratos §2) y catálogos (§4.7). Sin ARCO (RC-07 fuera del MVP).
import { Router } from "express";
import { z } from "zod";
import { normalizarCodigo } from "@numotion/core/dominio/acceso";
import { tiposDeTema } from "@numotion/core/dominio/catalogo";
import { MENSAJE_RESULTADO, PARENTESCOS } from "@numotion/core/dominio/consentimiento";
import { combinacionDisponible } from "@numotion/core/dominio/contenido";
import { destinoTrasLogin } from "@numotion/core/guardas";
import { conContexto } from "../../infra/db";
import { estadoDiagnosticos } from "./sesion-alumno";
import {
    borrarCookieSesion,
    cerrarSesionToken,
    fijarCookieSesion,
    grupoParaEntrar,
    loginAlumno,
    loginDocente,
    MIN_PASSWORD_DOCENTE,
    registrarDocente,
    tokenDeCookies,
} from "./auth";
import { aceptarConsentimiento, enviarCodigo, revocarConsentimiento, verConsentimiento } from "./consentimiento";
import { contextoDe, ErrorHttp, ipDe, noEncontrado, ruta, usuarioDe, validar, type CodigoError } from "./http";

export const rutasCore = Router();

// ───────────── Autenticación ─────────────

const LoginDocente = z.object({
    email: z.string().trim().toLowerCase().email().max(120),
    password: z.string().min(1).max(200),
    siguiente: z.string().max(300).optional(),
});

rutasCore.post("/auth/docente/login", ruta(async (req, res) => {
    const d = validar(LoginDocente, req.body);
    const r = await loginDocente(d.email, d.password, ipDe(req));
    if (!r.ok) throw new ErrorHttp(r.status, r.code, r.message);
    fijarCookieSesion(res, r.sesion);
    res.json({ docente: r.docente, destino: destinoTrasLogin("docente", d.siguiente) });
}));

// Los alumnos los da de alta su docente, nunca por autorregistro (RC-08)
const RegistroDocente = z.object({
    nombre: z.string().trim().min(3).max(120),
    email: z.string().trim().toLowerCase().email().max(120),
    password: z.string().min(MIN_PASSWORD_DOCENTE, `mínimo ${MIN_PASSWORD_DOCENTE} caracteres`).max(200),
    aceptaAviso: z.literal(true),
});

rutasCore.post("/auth/docente/registro", ruta(async (req, res) => {
    const d = validar(RegistroDocente, req.body);
    const r = await registrarDocente(d.nombre, d.email, d.password);
    fijarCookieSesion(res, r.sesion);
    res.status(201).json({ docente: r.docente, destino: "/docente" });
}));

// Invalida la sesión en BD, no solo la cookie
rutasCore.post("/auth/logout", ruta(async (req, res) => {
    await cerrarSesionToken(tokenDeCookies(req));
    borrarCookieSesion(res);
    res.status(204).end();
}));

rutasCore.get("/auth/alumno/grupo/:codigo", ruta(async (req, res) => {
    const codigo = normalizarCodigo(req.params.codigo ?? "");
    const grupo = codigo ? await grupoParaEntrar(codigo) : null;
    if (!grupo) throw noEncontrado("No encontramos ese código. Revísalo con tu maestro(a).");
    res.json(grupo);
}));

const LoginAlumno = z.object({
    grupoId: z.string().uuid(),
    alumnoId: z.string().uuid(),
    pin: z.array(z.string().max(20)).length(4),
    siguiente: z.string().max(300).optional(),
});

rutasCore.post("/auth/alumno/login", ruta(async (req, res) => {
    const d = validar(LoginAlumno, req.body);
    const r = await loginAlumno(d.grupoId, d.alumnoId, d.pin, ipDe(req));
    if (!r.ok) throw new ErrorHttp(r.status, r.code, r.message);
    fijarCookieSesion(res, r.sesion);
    res.json({ alumno: r.alumno, sesion: { id: r.sesionId }, destino: destinoTrasLogin("alumno", d.siguiente) });
}));

/** Sesión actual para el AuthProvider del SPA (06-navegacion §3). Sin sesión: { usuario: null }. */
rutasCore.get("/auth/sesion", ruta(async (_req, res) => {
    const u = usuarioDe(res);
    if (!u) return void res.json({ usuario: null });
    if (u.rol !== "alumno") return void res.json({ usuario: { id: u.id, nombre: u.nombre, rol: u.rol } });
    const d = await conContexto(contextoDe(u), estadoDiagnosticos);
    res.json({
        usuario: { id: u.id, nombre: u.nombre, rol: u.rol, grupoId: u.grupoId },
        // La sesión del alumno solo existe con consentimiento vigente (fn_sesion_auth)
        consentimientoVigente: true,
        sesion: { panasCompleto: d.panas, diagnosticoCompleto: d.matematico },
    });
}));

// ───────────── Consentimiento del tutor (público, por token) ─────────────

const STATUS_RESULTADO: Record<string, [number, CodigoError]> = {
    token_invalido: [404, "NO_ENCONTRADO"],
    token_vencido: [410, "CONFLICTO"],
    revocado: [409, "CONFLICTO"],
    otp_invalido: [422, "VALIDACION"],
    otp_vencido: [422, "VALIDACION"],
    espera: [429, "LIMITE_EXCEDIDO"],
};

function errorDeResultado(r: string): ErrorHttp {
    const [status, code] = STATUS_RESULTADO[r] ?? [400, "CONFLICTO"];
    return new ErrorHttp(status, code, MENSAJE_RESULTADO[r] ?? "No se pudo completar la solicitud.", { resultado: r });
}

const Otp = z.string().trim().regex(/^\d{6}$/, "6 dígitos");

// El token es una credencial: que no se filtre por Referer ni quede en cachés
rutasCore.use("/consentimiento/:token", (_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});

rutasCore.get("/consentimiento/:token", ruta(async (req, res) => {
    const vista = await verConsentimiento(req.params.token);
    if (!vista) throw noEncontrado("Este enlace no es válido.");
    res.json(vista);
}));

// Aceptar la plataforma incluye la cámara durante las actividades (A-41)
const Aceptar = z.object({
    otp: Otp,
    tutorNombre: z.string().trim().min(3).max(120),
    parentesco: z.enum(PARENTESCOS),
    aceptaPlataforma: z.literal(true),
});

rutasCore.post("/consentimiento/:token", ruta(async (req, res) => {
    const d = validar(Aceptar, req.body);
    const r = await aceptarConsentimiento(req.params.token, d, ipDe(req));
    if (r !== "ok") throw errorDeResultado(r);
    res.status(201).json({ aceptado: true });
}));

// Envía un código de 6 dígitos al correo del tutor (1 por minuto)
rutasCore.post("/consentimiento/:token/otp", ruta(async (req, res) => {
    const r = await enviarCodigo(req.params.token);
    if (r !== "ok") throw errorDeResultado(r);
    res.status(202).json({ enviado: true });
}));

// Revocar cierra las sesiones del alumno (EXP-01.5)
rutasCore.post("/consentimiento/:token/revocar", ruta(async (req, res) => {
    const d = validar(z.object({ otp: Otp }), req.body);
    const r = await revocarConsentimiento(req.params.token, d.otp, ipDe(req));
    if (r !== "ok") throw errorDeResultado(r);
    res.json({ revocado: true });
}));

// ───────────── Catálogos ─────────────

// Temas con los tipos de ejercicio que el motor ya sirve (A-25)
rutasCore.get("/catalogo/temas", ruta(async (_req, res) => {
    const temas = await conContexto(null, (tx) =>
        tx.tema.findMany({ select: { id: true, clave: true, nombre: true, grado_min: true, grado_max: true }, orderBy: { orden: "asc" } }));
    res.json({ items: temas.map(({ grado_min, grado_max, ...t }) => ({ ...t, gradoMin: grado_min, gradoMax: grado_max, tiposInteraccion: tiposDeTema(t.clave).filter((tipo) => combinacionDisponible(t.clave, tipo)) })) });
}));
