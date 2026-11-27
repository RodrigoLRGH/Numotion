// API del administrador (05-contratos §4.8): bandeja de solicitudes ARCO y su atención.
// La guarda por rol de app.ts ya exige sesión de administrador en /api/v1/admin/*.
import { Router } from "express";
import { z } from "zod";
import { conContexto } from "../../infra/db";
import { adminDe, consulta, contextoDe, ErrorHttp, ipDe, noEncontrado, paramId, ruta, validar } from "../core/http";
import { atenderSolicitud, avisarTutor, solicitudesArco } from "./arco";

export const rutasAdmin = Router();

rutasAdmin.get("/arco", ruta(async (req, res) => {
    const { estado } = validar(z.object({ estado: z.enum(["pendientes", "todas"]).default("pendientes") }), consulta(req));
    const items = await conContexto(contextoDe(adminDe(res)), (tx) => solicitudesArco(tx, estado === "pendientes"));
    res.json({ items });
}));

const Atencion = z.object({
    respuesta: z.string().trim().min(10, "escribe la respuesta para el tutor (mínimo 10 caracteres)").max(2000),
    anonimizar: z.boolean().default(false),
});

rutasAdmin.post("/arco/:id/atender", ruta(async (req, res) => {
    const id = paramId(req, "id", "Solicitud no encontrada");
    const d = validar(Atencion, req.body);
    const r = await conContexto(contextoDe(adminDe(res)), (tx) => atenderSolicitud(tx, id, d.respuesta, d.anonimizar, ipDe(req)));
    if (r.resultado !== "ok") {
        if (r.resultado === "no_encontrada") throw noEncontrado("Solicitud no encontrada");
        if (r.resultado === "ya_atendida") throw new ErrorHttp(409, "CONFLICTO", "Esta solicitud ya fue atendida");
        throw new ErrorHttp(422, "VALIDACION", "Solo se borran datos en cancelación, oposición o revocación");
    }
    const correoEnviado = await avisarTutor(r, d.respuesta, d.anonimizar);
    res.json({ atendida: true, anonimizado: d.anonimizar, correoEnviado });
}));
