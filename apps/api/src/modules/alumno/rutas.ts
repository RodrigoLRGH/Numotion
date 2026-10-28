// Rutas del módulo alumno (05-contratos §3). La guarda de rol y la compuerta de diagnósticos se
// aplican al montar el router; las de /diagnostico están exentas de la compuerta.
import { Router } from "express";
import { z } from "zod";
import { conContexto } from "../../infra/db";
import { alumnoDe, contextoDe, ErrorHttp, noEncontrado, paramId, ruta, validar } from "../core/http";
import { finalizarMatematico, finalizarPanas, panasDelDia, responderPanas, responderPregunta, siguientePregunta } from "./diagnostico";
import { iniciarActividad, misActividades, pedirGuia, registrarIntento, siguienteEjercicio, type FalloIntento, type Siguiente } from "./motor";

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

// Nivel del día + ejercicio vigente
rutasAlumno.post("/actividades/:id/iniciar", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Actividad no encontrada");
    res.json(responderSiguiente(await conContexto(contextoDe(alumno), (tx) => iniciarActividad(tx, alumno.id, id))));
}));

rutasAlumno.get("/actividades/:id/siguiente", ruta(async (req, res) => {
    const alumno = alumnoDe(res);
    const id = paramId(req, "id", "Actividad no encontrada");
    res.json(responderSiguiente(await conContexto(contextoDe(alumno), (tx) => siguienteEjercicio(tx, alumno.id, id))));
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
