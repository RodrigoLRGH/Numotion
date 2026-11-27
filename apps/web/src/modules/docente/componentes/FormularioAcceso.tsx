// Login y registro del docente (EXP-01.2). Un solo componente con dos modos.
import { useState } from "react";
import { api, ErrorApi, irA } from "../../../shared/cliente/api";
import iconoUsuario from "../../../assets/figma/usuario-acceso.svg";
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

    const login = modo === "login";
    return (
        <section className="mx-auto flex max-w-5xl flex-col items-center">
            <h1 className="text-center text-5xl font-bold text-titulo sm:text-7xl lg:text-8xl lg:whitespace-nowrap">{login ? "Iniciar Sesión" : "Registrar Cuenta"}</h1>
            {/* Ícono "Usuario" de Figma: se monta sobre el borde superior del panel */}
            <img src={iconoUsuario} alt="" width={212} height={210} className={`relative z-10 mt-6 ${login ? "size-36 sm:size-[212px]" : "size-32 sm:size-[150px]"}`} />
            <form onSubmit={enviar} className="-mt-16 flex w-full max-w-3xl flex-col gap-5 rounded-[3rem] bg-marca-panel px-6 pt-24 pb-10 sm:-mt-20 sm:rounded-[79px] sm:px-24">
                {!login && (
                    <div>
                        <label htmlFor="nombre" className="etiqueta font-normal sm:text-2xl">Nombre completo</label>
                        <input id="nombre" name="nombre" required minLength={3} maxLength={120} autoComplete="name" placeholder="Ingresa tu nombre" className="campo" />
                    </div>
                )}
                <div>
                    <label htmlFor="email" className="etiqueta font-normal sm:text-2xl">Correo</label>
                    <input id="email" name="email" type="email" required autoComplete="email" placeholder="nombre@ejemplo.com" className="campo" />
                </div>
                <div>
                    <label htmlFor="password" className="etiqueta font-normal sm:text-2xl">Contraseña</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        required
                        minLength={login ? 1 : MIN_PASSWORD}
                        autoComplete={login ? "current-password" : "new-password"}
                        aria-describedby={login ? undefined : "ayuda-password"}
                        placeholder="Ingresa tu contraseña"
                        className="campo"
                    />
                    {!login && <p id="ayuda-password" className="mt-1 px-2 text-sm text-tinta-suave">La contraseña debe tener al menos {MIN_PASSWORD} caracteres.</p>}
                </div>
                {!login && (
                    <label className="flex items-start gap-2 px-2">
                        <input type="checkbox" name="aceptaAviso" required className="mt-1 size-5 accent-marca-fuerte" />
                        <span>He leído y acepto el <a href="/privacidad" className="enlace">aviso de privacidad</a>.</span>
                    </label>
                )}
                {error && <Aviso tipo="error">{error}</Aviso>}
                <button type="submit" className="boton mx-auto mt-2 w-full max-w-sm uppercase" disabled={ocupado}>
                    {login ? "Iniciar sesión" : "Registrar"}
                </button>
            </form>
            <p className="mt-8 text-center text-xl text-titulo">
                {login ? (
                    <>¿No tienes cuenta? <a href="/docente/registro" className="underline underline-offset-2">Regístrate</a></>
                ) : (
                    <>¿Ya tienes cuenta? <a href="/docente/entrar" className="underline underline-offset-2">Iniciar Sesión</a></>
                )}
            </p>
        </section>
    );
}
