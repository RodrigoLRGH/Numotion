// Guardas de pantalla (06-navegacion §3). Son experiencia de usuario: la API valida de nuevo
// (401 NO_AUTENTICADO, 403 DIAGNOSTICOS_PENDIENTES) y el cliente HTTP traduce esos códigos.
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, type Rol } from "./auth";

const inicioDe = (rol: Rol) => `/${rol}`;

function Cargando() {
    return <p role="status" className="p-6 text-center text-xl">Cargando…</p>;
}

export function RequireRole({ role }: { role: Rol }) {
    const { estado, usuario } = useAuth();
    const ubicacion = useLocation();
    if (estado === "cargando") return <Cargando />;
    if (!usuario) return <Navigate to={`/${role}/entrar?next=${encodeURIComponent(ubicacion.pathname + ubicacion.search)}`} replace />;
    if (usuario.rol !== role) return <Navigate to={inicioDe(usuario.rol)} replace />;
    return <Outlet />;
}

export function RedirectIfAuth({ children }: { children: ReactNode }) {
    const { estado, usuario } = useAuth();
    if (estado === "cargando") return <Cargando />;
    return usuario ? <Navigate to={inicioDe(usuario.rol)} replace /> : <>{children}</>;
}

export function RequireConsent() {
    const { consentimientoVigente } = useAuth();
    return consentimientoVigente ? <Outlet /> : <Navigate to="/alumno/sin-permiso" replace />;
}

export function RequirePanas() {
    const { sesion } = useAuth();
    return sesion.panasCompleto ? <Outlet /> : <Navigate to="/alumno/diagnostico/emocional" replace />;
}

export function RequireDiagnosticos() {
    const { sesion } = useAuth();
    if (!sesion.panasCompleto) return <Navigate to="/alumno/diagnostico/emocional" replace />;
    if (!sesion.diagnosticoCompleto) return <Navigate to="/alumno/diagnostico/matematico" replace />;
    return <Outlet />;
}
