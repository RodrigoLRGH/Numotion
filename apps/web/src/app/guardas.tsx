// Guardas de pantalla (06-navegacion §3). Son experiencia de usuario: la API valida de nuevo
// (401 NO_AUTENTICADO, 403 DIAGNOSTICOS_PENDIENTES) y el cliente HTTP traduce esos códigos.
import { Camera } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { hayCamara } from "../shared/cliente/camara";
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

/** RC-03: sin cámara en el dispositivo el alumno no entra (ni a la pantalla de acceso). */
export function RequireCamara() {
    const [camara, setCamara] = useState<"comprobando" | "si" | "no">("comprobando");
    const comprobar = useCallback(() => {
        void hayCamara().then((si) => setCamara(si ? "si" : "no"));
    }, []);
    useEffect(() => {
        comprobar();
        // Si conectan una cámara USB, se desbloquea sin recargar
        const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
        md?.addEventListener?.("devicechange", comprobar);
        return () => md?.removeEventListener?.("devicechange", comprobar);
    }, [comprobar]);

    if (camara === "comprobando") return <Cargando />;
    if (camara === "si") return <Outlet />;
    return (
        <section aria-labelledby="sin-camara" className="tarjeta mx-auto max-w-xl text-center">
            <Camera aria-hidden="true" className="mx-auto size-16 text-marca" />
            <h1 id="sin-camara" className="mt-3 text-3xl font-bold">Este dispositivo no tiene cámara</h1>
            <p className="mt-3">Para usar la plataforma necesitas una computadora o tableta con cámara. Avisa a tu maestro(a).</p>
            <button type="button" className="boton mt-6 min-h-14 px-8 text-xl" onClick={comprobar}>Revisar otra vez</button>
        </section>
    );
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
