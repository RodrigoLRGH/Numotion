// Rutas del módulo alumno (05-contratos §3). La guarda de rol y la compuerta de diagnósticos se
// aplican al montar el router; las de /diagnostico están exentas de la compuerta.
import express, { Router } from "express";
import { z } from "zod";
import { conContexto } from "../../infra/db";
import { alumnoDe, contextoDe, ErrorHttp, noEncontrado, paramId, ruta, validar } from "../core/http";
import { finalizarMatematico, finalizarPanas, panasDelDia, responderPanas, responderPregunta, siguientePregunta } from "./diagnostico";
import { servirEjercicio } from "./contenido";
import { TIPOS_INTERACCION } from "@numotion/core/dominio/catalogo";
import { procesarFrame, responderAlerta } from "./emociones";
import { completarPractica, iniciarPractica, intentoPractica, juegosDisponibles, panel, perfil, type FalloPractica } from "./gamificacion";
import { misActividades, pedirGuia, registrarIntento, type FalloIntento, type Siguiente } from "./motor";

export const rutasAlumno = Router();

// ───────────── Diagnósticos (§3.1, EXP-02) ─────────────

rutasAlumno.get("/diagnostico/panas", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    res.json(await conContexto(contextoDe(alumno), (tx) => panasDelDia(tx, alumno.id)));
}));

// Guardado incremental de una respuesta (1..5)
rutasAlumno.put("/diagnostico/panas/respuestas/:itemId", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const itemId = paramId(req, "itemId", "Pregunta no encontrada");
    const { valor } = validar(z.object({ valor: z.number().int().min(1).max(5) }), req.body);
    const r = await conContexto(contextoDe(alumno), (tx) => responderPanas(tx, alumno.id, itemId, valor));
    if (r === "item_desconocido") throw noEncontrado("Pregunta no encontrada");
    if (r === "completado") throw new ErrorHttp(409, "CONFLICTO", "El cuestionario de hoy ya está terminado");
    if (r === "valor_invalido") throw new ErrorHttp(400, "VALIDACION", "Elige una de las 5 opciones");
    res.status(204).end();
}));

// A-21: no devuelve AP/AN (el alumno nunca ve sus puntajes)
rutasAlumno.post("/diagnostico/panas/finalizar", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    const r = await conContexto(contextoDe(alumno), (tx) => finalizarPanas(tx, alumno.id));
    if (!r.ok) throw new ErrorHttp(422, "VALIDACION", "Faltan preguntas por responder", { faltan: r.faltan });
    res.json({ completado: true });
}));

const panasPendiente = () => new ErrorHttp(409, "CONFLICTO", "Primero cuéntanos cómo te sientes hoy");

rutasAlumno.get("/diagnostico/matematico/siguiente", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    const r = await conContexto(contextoDe(alumno), (tx) => siguientePregunta(tx, alumno.id));
    if ("error" in r) throw panasPendiente();
    res.json(r);
}));

const RespuestaDiagnostico = z.object({
    preguntaId: z.string().uuid(),
    respuesta: z.string().trim().min(1).max(200),
    tiempoMs: z.number().min(0).max(30 * 60_000),
});

// Califica sin revelar la respuesta correcta
rutasAlumno.post("/diagnostico/matematico/respuestas", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const d = validar(RespuestaDiagnostico, req.body);
    const r = await conContexto(contextoDe(alumno), (tx) => responderPregunta(tx, alumno.id, d.preguntaId, d.respuesta, d.tiempoMs));
    if (!r) throw noEncontrado("Esa pregunta ya no está pendiente");
    res.json(r);
}));

rutasAlumno.post("/diagnostico/matematico/finalizar", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    const r = await conContexto(contextoDe(alumno), (tx) => finalizarMatematico(tx, alumno.id));
    if (r.ok) return void res.json({ dominio: r.dominio, retroalimentacionId: r.retroalimentacionId });
    throw r.motivo === "panas_pendiente" ? panasPendiente() : new ErrorHttp(422, "VALIDACION", "Aún faltan preguntas por responder");
}));

// ───────────── Actividades y motor (§3.2–3.3, EXP-04) ─────────────

function responderSiguiente(r: Siguiente) {
    if (!("error" in r)) return r;
    throw r.error === "no_encontrada"
        ? noEncontrado("Actividad no encontrada")
        : new ErrorHttp(422, "VALIDACION", "Esta actividad todavía no tiene ejercicios disponibles");
}

const ERRORES_INTENTO: Record<FalloIntento["error"], ErrorHttp> = {
    no_encontrada: noEncontrado("Actividad no encontrada"),
    completada: new ErrorHttp(409, "ASIGNACION_COMPLETADA", "La actividad ya está completada"),
    ejercicio_no_vigente: new ErrorHttp(409, "CONFLICTO", "Ese ejercicio ya no está activo"),
    cliente_repetido: new ErrorHttp(409, "CONFLICTO", "Intento repetido"),
};

rutasAlumno.get("/actividades", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    res.json({ items: await conContexto(contextoDe(alumno), (tx) => misActividades(tx, alumno.id)) });
}));

// Nivel del día + ejercicio vigente (con historia de OpenAI si está activo, EXP-04.7)
rutasAlumno.post("/actividades/:id/iniciar", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Actividad no encontrada");
    res.json(responderSiguiente(await servirEjercicio(contextoDe(alumno), id, true)));
}));

rutasAlumno.get("/actividades/:id/siguiente", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Actividad no encontrada");
    res.json(responderSiguiente(await servirEjercicio(contextoDe(alumno), id, false)));
}));

// POST y no GET: abrir la guía cambia los puntos del ejercicio (tras guía = 3)
rutasAlumno.post("/ejercicios/:id/guia", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Ese ejercicio ya no está activo");
    const { asignacionId } = validar(z.object({ asignacionId: z.string().uuid() }), req.body);
    const guia = await conContexto(contextoDe(alumno), (tx) => pedirGuia(tx, alumno.id, asignacionId, id));
    if (!guia) throw noEncontrado("Ese ejercicio ya no está activo");
    res.json(guia);
}));

const Intento = z.object({
    clienteId: z.string().uuid(),
    asignacionId: z.string().uuid(),
    ejercicioId: z.string().uuid(),
    respuesta: z.string().trim().min(1).max(200),
    tiempoMs: z.number().int().min(0).max(30 * 60_000),
    ayudaSolicitada: z.boolean().default(false),
});

// Idempotente por clienteId: un reintento devuelve la misma respuesta
rutasAlumno.post("/intentos", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const d = validar(Intento, req.body);
    const r = await conContexto(contextoDe(alumno), (tx) => registrarIntento(tx, alumno.id, d));
    if ("error" in r) throw ERRORES_INTENTO[r.error];
    res.status(201).json(r);
}));

// ───────────── Panel, perfil y práctica libre (§3.2, §3.5, EXP-06) ─────────────

rutasAlumno.get("/panel", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    res.json(await conContexto(contextoDe(alumno), (tx) => panel(tx, alumno.id)));
}));

// Sin datos emocionales ni de otros alumnos (EXP-06.4)
rutasAlumno.get("/perfil", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    res.json(await conContexto(contextoDe(alumno), (tx) => perfil(tx, alumno.id)));
}));

rutasAlumno.get("/practica", ruta(async (_req, res) => {
    const alumno = alumnoDe(res);
    res.json({ items: await conContexto(contextoDe(alumno), (tx) => juegosDisponibles(tx, alumno.id)) });
}));

const tiposInteraccion = TIPOS_INTERACCION.map((t) => t.id) as [string, ...string[]];
const NuevaPractica = z.object({ tipo: z.enum(tiposInteraccion), temaId: z.string().uuid() });

rutasAlumno.post("/practica", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const d = validar(NuevaPractica, req.body);
    const r = await conContexto(contextoDe(alumno), (tx) => iniciarPractica(tx, alumno.id, d.tipo as (typeof TIPOS_INTERACCION)[number]["id"], d.temaId));
    if ("error" in r) throw new ErrorHttp(422, "VALIDACION", "Ese juego no está disponible");
    res.status(201).json(r);
}));

const ERRORES_PRACTICA: Record<FalloPractica["error"], ErrorHttp> = {
    no_encontrada: noEncontrado("Juego no encontrado"),
    completada: new ErrorHttp(409, "CONFLICTO", "Ese juego ya terminó"),
    ejercicio_no_vigente: new ErrorHttp(409, "CONFLICTO", "Ese ejercicio ya no está activo"),
    cliente_repetido: new ErrorHttp(409, "CONFLICTO", "Intento repetido"),
    incompleta: new ErrorHttp(422, "VALIDACION", "Todavía faltan ejercicios por resolver"),
};

const IntentoPractica = z.object({
    clienteId: z.string().uuid(),
    ejercicioId: z.string().uuid(),
    respuesta: z.string().trim().min(1).max(200),
    tiempoMs: z.number().int().min(0).max(30 * 60_000),
});

rutasAlumno.post("/practica/:id/intentos", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Juego no encontrado");
    const d = validar(IntentoPractica, req.body);
    const r = await conContexto(contextoDe(alumno), (tx) => intentoPractica(tx, alumno.id, id, d));
    if ("error" in r) throw ERRORES_PRACTICA[r.error];
    res.status(201).json(r);
}));

rutasAlumno.post("/practica/:id/completar", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Juego no encontrado");
    const r = await conContexto(contextoDe(alumno), (tx) => completarPractica(tx, alumno.id, id));
    if ("error" in r) throw ERRORES_PRACTICA[r.error];
    res.json(r);
}));

// ───────────── Emociones y alertas (§3.4, EXP-05) ─────────────

// Fotograma JPEG/PNG/WebP ≤ 100 KB. Nunca se guarda ni se registra; la respuesta no revela la emoción (RF-65).
const cuerpoImagen = express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "100kb" });
const ConsultaFrame = z.object({
    asignacionId: z.string().uuid().optional(),
    inactividadSeg: z.coerce.number().min(0).max(3600).default(0),
});

rutasAlumno.post("/emociones/frame", cuerpoImagen, ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const q = validar(ConsultaFrame, req.query);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new ErrorHttp(400, "VALIDACION", "Envía una imagen JPEG, PNG o WebP");
    const imagen = new Uint8Array(req.body.buffer, req.body.byteOffset, req.body.length);
    const r = await procesarFrame(contextoDe(alumno), Boolean(alumno.aceptaCamara), imagen, q.asignacionId ?? null, q.inactividadSeg);
    req.body = undefined;
    if (!r.procesado && r.motivo === "frecuencia") throw new ErrorHttp(429, "LIMITE_EXCEDIDO", "Demasiados fotogramas; espera unos segundos");
    if (!r.procesado && r.motivo === "sin_consentimiento") throw new ErrorHttp(403, "CONSENTIMIENTO_REQUERIDO", "Tu tutor no autorizó el uso de la cámara");
    res.json(r.procesado ? { procesado: true, ofrecerAyuda: r.ofrecerAyuda } : { procesado: false, motivo: r.motivo });
}));

rutasAlumno.post("/alertas/:id/respuesta", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Alerta no encontrada");
    const { aceptaAyuda } = validar(z.object({ aceptaAyuda: z.boolean() }), req.body);
    if (!(await conContexto(contextoDe(alumno), (tx) => responderAlerta(tx, alumno.id, id, aceptaAyuda)))) throw noEncontrado("Alerta no encontrada");
    res.status(204).end();
}));
