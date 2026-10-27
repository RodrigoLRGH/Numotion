// Política de acceso por rol (RNF-04) y compuerta de diagnósticos (RF-63).
// Función pura: el middleware la aplica y las pruebas la verifican sin servidor.
import type { Rol } from "./auth";

export type DecisionAcceso =
    | { tipo: "permitir" }
    | { tipo: "redirigir"; destino: string }
    | { tipo: "noAutorizado" } // API: 401
    | { tipo: "prohibido" }; // API: 403

export interface EstadoDiagnosticos {
    panas: boolean;
    matematico: boolean;
}

export function inicioDeRol(rol: Rol): string {
    return rol === "docente" ? "/docente" : "/alumno";
}

export function areaDeRuta(ruta: string): Rol | "publica" {
    if (ruta === "/docente" || ruta.startsWith("/docente/") || ruta.startsWith("/api/docente/")) return "docente";
    if (ruta === "/alumno" || ruta.startsWith("/alumno/") || ruta.startsWith("/api/alumno/")) return "alumno";
    return "publica";
}

/** Rutas del alumno accesibles antes de completar los diagnósticos de la sesión. */
function exentaDeDiagnostico(ruta: string): boolean {
    return (
        ruta.startsWith("/alumno/diagnostico") ||
        ruta === "/api/alumno/panas" ||
        ruta === "/api/alumno/diagnostico" ||
        ruta === "/api/alumno/emocion"
    );
}

export function decidirAcceso(
    ruta: string,
    usuario: { rol: Rol } | null,
    diagnosticos: EstadoDiagnosticos | null,
): DecisionAcceso {
    const esApi = ruta.startsWith("/api/");
    const area = areaDeRuta(ruta);

    if (area === "publica") {
        if (usuario && (ruta === "/login" || ruta === "/registro")) {
            return { tipo: "redirigir", destino: inicioDeRol(usuario.rol) };
        }
        return { tipo: "permitir" };
    }

    if (!usuario) return esApi ? { tipo: "noAutorizado" } : { tipo: "redirigir", destino: `/login?siguiente=${encodeURIComponent(ruta)}` };
    if (usuario.rol !== area) return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: inicioDeRol(usuario.rol) };

    if (area === "alumno" && !exentaDeDiagnostico(ruta) && diagnosticos) {
        if (!diagnosticos.panas) return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: "/alumno/diagnostico/emocional" };
        if (!diagnosticos.matematico) return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: "/alumno/diagnostico/matematico" };
    }
    return { tipo: "permitir" };
}
