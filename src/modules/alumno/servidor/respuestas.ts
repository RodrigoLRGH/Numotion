// Traducción de los resultados del motor a respuestas HTTP (05-contratos §3.3)
import { error, json } from "../../shared/servidor/http";
import type { Siguiente } from "./motor";

export function respuestaSiguiente(r: Siguiente): Response {
    if ("error" in r) {
        return r.error === "no_encontrada"
            ? error("NO_ENCONTRADO", "Actividad no encontrada", 404)
            : error("VALIDACION", "Esta actividad todavía no tiene ejercicios disponibles", 422);
    }
    return json(r);
}

export function errorIntento(e: "no_encontrada" | "completada" | "ejercicio_no_vigente" | "cliente_repetido"): Response {
    switch (e) {
        case "no_encontrada":
            return error("NO_ENCONTRADO", "Actividad no encontrada", 404);
        case "completada":
            return error("ASIGNACION_COMPLETADA", "La actividad ya está completada", 409);
        case "ejercicio_no_vigente":
            return error("CONFLICTO", "Ese ejercicio ya no está activo", 409);
        case "cliente_repetido":
            return error("CONFLICTO", "Intento repetido", 409);
    }
}
