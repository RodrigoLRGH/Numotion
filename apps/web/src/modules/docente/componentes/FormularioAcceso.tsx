// Login y registro del docente (EXP-01.2). Un solo componente con dos modos.
import { useState } from "react";
import { api, ErrorApi, irA } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";

interface Props {
    modo: "login" | "registro";
    siguiente?: string;
}

const MIN_PASSWORD = 10;

export default function FormularioAcceso({ modo, siguiente }: Props) {
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    async function enviar(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setOcupado(true);
        setError(null);
        try {
            const r =
                modo === "login"
                    ? await api<{ destino: string }>("POST", "/auth/docente/login", { email: f.get("email"), password: f.get("password"), siguiente })
                    : await api<{ destino: string }>("POST", "/auth/docente/registro", {
                          nombre: f.get("nombre"),
                          email: f.get("email"),
                          password: f.get("password"),
                          aceptaAviso: f.get("aceptaAviso") === "on",
                      });
            irA(r.destino);
        } catch (err) {
            setError(err instanceof ErrorApi ? err.message : "Algo salió mal.");
            setOcupado(false);
        }
    }

    return (
        <form onSubmit={enviar} className="tarjeta mx-auto flex max-w-md flex-col gap-4">
            <h1 className="text-2xl font-extrabold">{modo === "login" ? "Entrar como docente" : "Crear cuenta de docente"}</h1>
            {modo === "registro" && (
                <div>
                    <label htmlFor="nombre" className="etiqueta">Nombre completo</label>
                    <input id="nombre" name="nombre" required minLength={3} maxLength={120} autoComplete="name" className="campo" />
                </div>
            )}
            <div>
                <label htmlFor="email" className="etiqueta">Correo</label>
                <input id="email" name="email" type="email" required autoComplete="email" className="campo" />
            </div>
            <div>
                <label htmlFor="password" className="etiqueta">Contraseña</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={modo === "registro" ? MIN_PASSWORD : 1}
                    autoComplete={modo === "login" ? "current-password" : "new-password"}
                    aria-describedby={modo === "registro" ? "ayuda-password" : undefined}
                    className="campo"
                />
                {modo === "registro" && <p id="ayuda-password" className="mt-1 text-sm text-tinta-suave">Mínimo {MIN_PASSWORD} caracteres.</p>}
            </div>
            {modo === "registro" && (
                <label className="flex items-start gap-2">
                    <input type="checkbox" name="aceptaAviso" required className="mt-1 size-5" />
                    <span>He leído y acepto el <a href="/privacidad" className="font-bold text-marca underline">aviso de privacidad</a>.</span>
                </label>
            )}
            {error && <Aviso tipo="error">{error}</Aviso>}
            <button type="submit" className="boton" disabled={ocupado}>
                {modo === "login" ? "Entrar" : "Crear cuenta"}
            </button>
            <p className="text-center text-sm">
                {modo === "login" ? (
                    <>¿No tienes cuenta? <a href="/docente/registro" className="font-bold text-marca underline">Regístrate</a></>
                ) : (
                    <>¿Ya tienes cuenta? <a href="/docente/entrar" className="font-bold text-marca underline">Entra</a></>
                )}
            </p>
        </form>
    );
}
