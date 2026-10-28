// Sesión del SPA (06-navegacion §3). La cookie es HttpOnly: el cliente solo conoce lo que devuelve
// GET /auth/sesion. Las guardas de pantalla son UX; la API vuelve a validar todo.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../shared/cliente/api";

export type Rol = "docente" | "alumno";

export interface Usuario {
    id: string;
    nombre: string;
    rol: Rol;
    grupoId?: string;
}

export interface Sesion {
    estado: "cargando" | "listo";
    usuario: Usuario | null;
    camaraPermitida: boolean;
    consentimientoVigente: boolean;
    /** Diagnósticos del día del alumno */
    sesion: { panasCompleto: boolean; diagnosticoCompleto: boolean };
}

interface ContextoAuth extends Sesion {
    refrescar(): Promise<void>;
    salir(): Promise<void>;
}

const inicial: Sesion = {
    estado: "cargando",
    usuario: null,
    camaraPermitida: false,
    consentimientoVigente: false,
    sesion: { panasCompleto: false, diagnosticoCompleto: false },
};

const Contexto = createContext<ContextoAuth | null>(null);

interface RespuestaSesion {
    usuario: Usuario | null;
    camaraPermitida?: boolean;
    consentimientoVigente?: boolean;
    sesion?: Sesion["sesion"];
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [estado, setEstado] = useState<Sesion>(inicial);

    const refrescar = useCallback(async () => {
        try {
            const r = await api<RespuestaSesion>("GET", "/auth/sesion");
            setEstado({
                estado: "listo",
                usuario: r.usuario,
                camaraPermitida: Boolean(r.camaraPermitida),
                consentimientoVigente: r.usuario?.rol === "docente" || Boolean(r.consentimientoVigente),
                sesion: r.sesion ?? inicial.sesion,
            });
        } catch {
            setEstado({ ...inicial, estado: "listo" });
        }
    }, []);

    const salir = useCallback(async () => {
        await api("POST", "/auth/logout").catch(() => undefined);
        setEstado({ ...inicial, estado: "listo" });
    }, []);

    useEffect(() => {
        void refrescar();
    }, [refrescar]);

    return <Contexto.Provider value={{ ...estado, refrescar, salir }}>{children}</Contexto.Provider>;
}

export function useAuth(): ContextoAuth {
    const c = useContext(Contexto);
    if (!c) throw new Error("useAuth fuera de AuthProvider");
    return c;
}
