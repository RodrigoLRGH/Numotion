// Política de acceso por rol (RNF-04) y compuerta de diagnósticos (RF-63).
// Función pura: el middleware la aplica y las pruebas la verifican sin servidor.
import type { Rol } from "./auth";

export type DecisionAcceso =
    | { tipo: "permitir" }
    | { tipo: "redirigir"; destino: string }
    | { tipo: "noAutorizado" } // API: 401 NO_AUTENTICADO
    | { tipo: "prohibido" } // API: 403
    | { tipo: "diagnosticosPendientes" }; // API: 403 DIAGNOSTICOS_PENDIENTES

export interface EstadoDiagnosticos {
    panas: boolean;
    matematico: boolean;
}

export const API = "/api/v1";

export function inicioDeRol(rol: Rol): string {
    return rol === "docente" ? "/docente" : "/alumno";
}

function bajo(ruta: string, base: string): boolean {
    return ruta === base || ruta.startsWith(`${base}/`);
}

export function areaDeRuta(ruta: string): Rol | "publica" {
    if (bajo(ruta, "/docente") || bajo(ruta, `${API}/docente`)) return "docente";
    if (bajo(ruta, "/alumno") || bajo(ruta, `${API}/alumno`)) return "alumno";
    return "publica";
}

/** Páginas de entrada: con sesión activa no tienen sentido y se redirige al inicio del rol. */
const PAGINAS_ENTRADA = new Set(["/login", "/registro", "/entrar"]);

/** Rutas del alumno accesibles antes de completar los diagnósticos de la sesión. */
function exentaDeDiagnostico(ruta: string): boolean {
    return bajo(ruta, "/alumno/diagnostico") || bajo(ruta, `${API}/alumno/diagnostico`) || ruta === `${API}/alumno/emociones/frame`;
}

export function decidirAcceso(
    ruta: string,
    usuario: { rol: Rol } | null,
    diagnosticos: EstadoDiagnosticos | null,
): DecisionAcceso {
    const esApi = ruta.startsWith("/api/");
    const area = areaDeRuta(ruta);

    if (area === "publica") {
        if (usuario && PAGINAS_ENTRADA.has(ruta)) return { tipo: "redirigir", destino: inicioDeRol(usuario.rol) };
        return { tipo: "permitir" };
    }

    if (!usuario) {
        if (esApi) return { tipo: "noAutorizado" };
        const entrada = area === "alumno" ? "/entrar" : "/login";
        return { tipo: "redirigir", destino: `${entrada}?siguiente=${encodeURIComponent(ruta)}` };
    }
    if (usuario.rol !== area) return esApi ? { tipo: "prohibido" } : { tipo: "redirigir", destino: inicioDeRol(usuario.rol) };

    if (area === "alumno" && !exentaDeDiagnostico(ruta) && diagnosticos) {
        if (!diagnosticos.panas) return esApi ? { tipo: "diagnosticosPendientes" } : { tipo: "redirigir", destino: "/alumno/diagnostico/emocional" };
        if (!diagnosticos.matematico) return esApi ? { tipo: "diagnosticosPendientes" } : { tipo: "redirigir", destino: "/alumno/diagnostico/matematico" };
    }
    return { tipo: "permitir" };
}

/** Solo se permite volver a una ruta del área del propio rol (evita redirecciones abiertas). */
export function destinoTrasLogin(rol: Rol, siguiente: string | undefined | null): string {
    const inicio = inicioDeRol(rol);
    return siguiente && bajo(siguiente.split(/[?#]/)[0], inicio) && !siguiente.startsWith("//") ? siguiente : inicio;
}
