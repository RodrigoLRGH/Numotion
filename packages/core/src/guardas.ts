// Política de acceso por rol (RNF-04) y compuerta de diagnósticos (RF-63) de la API.
// Función pura: el middleware de Express la aplica y las pruebas la verifican sin servidor.
// Las guardas de pantalla del SPA (06-navegacion §3) usan las mismas rutas de entrada.

export type Rol = "docente" | "alumno" | "admin";

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
    return `/${rol}`;
}

function bajo(ruta: string, base: string): boolean {
    return ruta === base || ruta.startsWith(`${base}/`);
}

export function areaDeRuta(ruta: string): Rol | "publica" {
    if (bajo(ruta, "/docente") || bajo(ruta, `${API}/docente`)) return "docente";
    if (bajo(ruta, "/alumno") || bajo(ruta, `${API}/alumno`)) return "alumno";
    if (bajo(ruta, "/admin") || bajo(ruta, `${API}/admin`)) return "admin";
    return "publica";
}

/** Páginas de entrada: con sesión activa no tienen sentido y se redirige al inicio del rol. */
const PAGINAS_ENTRADA = new Set(["/docente/entrar", "/docente/registro", "/alumno/entrar", "/admin/entrar"]);

export function entradaDeRol(rol: Rol): string {
    return `/${rol}/entrar`;
}

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
    // Las páginas de entrada y la de "sin permiso" son públicas aunque estén bajo /docente o /alumno
    if (PAGINAS_ENTRADA.has(ruta)) return usuario ? { tipo: "redirigir", destino: inicioDeRol(usuario.rol) } : { tipo: "permitir" };
    if (ruta === "/alumno/sin-permiso") return { tipo: "permitir" };

    const area = areaDeRuta(ruta);
    if (area === "publica") return { tipo: "permitir" };
    if (!usuario) return esApi ? { tipo: "noAutorizado" } : { tipo: "redirigir", destino: `${entradaDeRol(area)}?next=${encodeURIComponent(ruta)}` };
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
