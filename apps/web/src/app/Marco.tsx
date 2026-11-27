// Estructura común de todas las pantallas: encabezado azul (Figma "Header"), pestañas por rol, contenido y pie.
// El módulo alumno usa tipografía base de 20 px y objetivos de 48 px (04-arquitectura §7).
import { House, User } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { NOMBRE_PRODUCTO } from "@numotion/core/marca";
import iconoUsuario from "../assets/figma/usuario-encabezado.svg";
import { useAuth } from "./auth";

const ENLACES_DOCENTE = [
    { to: "/docente", texto: "Dashboard", fin: true },
    { to: "/docente/actividades", texto: "Actividades" },
    { to: "/docente/reportes", texto: "Reportes" },
    { to: "/docente/retroalimentaciones", texto: "Retroalimentaciones" },
    { to: "/docente/grupos", texto: "Grupos" },
    { to: "/docente/historial", texto: "Historial" },
] as const;

/** Botón circular de usuario (Figma "Usuario", 65 px) con un menú para cerrar sesión. */
function MenuUsuario({ nombre }: { nombre: string }) {
    const { salir } = useAuth();
    const navegar = useNavigate();
    const [abierto, setAbierto] = useState(false);
    const idMenu = useId();
    const raiz = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!abierto) return;
        const cerrarFuera = (e: PointerEvent) => !raiz.current?.contains(e.target as Node) && setAbierto(false);
        const cerrarEsc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
        document.addEventListener("pointerdown", cerrarFuera);
        document.addEventListener("keydown", cerrarEsc);
        return () => {
            document.removeEventListener("pointerdown", cerrarFuera);
            document.removeEventListener("keydown", cerrarEsc);
        };
    }, [abierto]);

    return (
        <div ref={raiz} className="relative">
            <button
                type="button"
                aria-label={`Cuenta de ${nombre}`}
                aria-expanded={abierto}
                aria-controls={idMenu}
                onClick={() => setAbierto((a) => !a)}
                className="flex cursor-pointer rounded-full focus-visible:outline-white"
            >
                <img src={iconoUsuario} alt="" width={65} height={65} className="size-12 sm:size-[65px]" />
            </button>
            <div id={idMenu} hidden={!abierto} className="absolute top-full right-0 z-30 mt-2 w-60 rounded-3xl bg-white p-4 text-tinta shadow-lg">
                <p className="truncate font-bold">{nombre}</p>
                <button
                    type="button"
                    onClick={async () => {
                        await salir();
                        navegar("/", { replace: true });
                    }}
                    className="boton-secundario mt-3 w-full"
                >
                    Salir
                </button>
            </div>
        </div>
    );
}

function Encabezado() {
    const { usuario } = useAuth();
    return (
        <header className="bg-marca text-white">
            <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-white focus:px-3 focus:py-1 focus:text-marca-fuerte">
                Saltar al contenido
            </a>
            <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:min-h-[110px] sm:px-8">
                <Link to={usuario ? `/${usuario.rol}` : "/"} className="text-4xl font-bold tracking-tight uppercase focus-visible:outline-white sm:text-6xl">
                    {NOMBRE_PRODUCTO}
                </Link>
                {usuario?.rol === "docente" && <MenuUsuario nombre={usuario.nombre} />}
                {usuario?.rol === "alumno" && <NavAlumno />}
            </div>
        </header>
    );
}

const ENLACES_ALUMNO = [
    { to: "/alumno", texto: "Mi panel", icono: House, fin: true },
    { to: "/alumno/perfil", texto: "Perfil", icono: User, fin: false },
] as const;

/** Navegación del alumno dentro de la barra azul. Texto blanco en negritas de 20 px: sobre #0098FF solo
 *  cumple como texto grande (3:1); el activo y el hover usan marca-fuerte (8:1). */
function NavAlumno() {
    const { salir } = useAuth();
    const navegar = useNavigate();
    return (
        <nav aria-label="Principal" className="flex flex-wrap items-center gap-1">
            {ENLACES_ALUMNO.map((e) => (
                <NavLink
                    key={e.to}
                    to={e.to}
                    end={e.fin}
                    className={({ isActive }) =>
                        `inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-xl font-bold hover:bg-marca-fuerte focus-visible:outline-white ${isActive ? "bg-marca-fuerte" : ""}`
                    }
                >
                    <e.icono aria-hidden="true" className="size-6 shrink-0" />
                    {e.texto}
                </NavLink>
            ))}
            <button
                type="button"
                onClick={async () => {
                    await salir();
                    navegar("/", { replace: true });
                }}
                className="ml-2 min-h-12 cursor-pointer rounded-full border-2 border-white px-5 text-xl font-bold hover:bg-marca-fuerte focus-visible:outline-white"
            >
                Salir
            </button>
        </nav>
    );
}

/** Pestañas en píldora (Figma: gris #F4F4F4, activa amarilla #FFE44D). */
function Pestanas() {
    const { usuario } = useAuth();
    // El alumno navega desde la barra azul (NavAlumno)
    if (usuario?.rol !== "docente") return null;
    return (
        <nav aria-label="Principal" className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-8 sm:pt-12">
            <ul className="flex flex-wrap gap-3 lg:flex-nowrap">
                {ENLACES_DOCENTE.map((e) => (
                    <li key={e.to} className="lg:flex-1">
                        <NavLink
                            to={e.to}
                            end={"fin" in e && e.fin}
                            className={({ isActive }) =>
                                `inline-flex min-h-12 items-center justify-center rounded-full px-5 py-2 text-lg whitespace-nowrap lg:min-h-14 lg:w-full lg:px-6 lg:text-xl ${
                                    isActive ? "bg-acento" : "bg-superficie hover:bg-neutro"
                                }`
                            }
                        >
                            {e.texto}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}

export function Marco({ children, modulo = "publico", ancho = "normal" }: { children?: ReactNode; modulo?: "alumno" | "docente" | "publico"; ancho?: "normal" | "amplio" }) {
    return (
        <div className={`flex min-h-screen flex-col bg-fondo font-sans ${modulo === "alumno" ? "text-xl" : ""}`} data-modulo={modulo}>
            <Encabezado />
            <Pestanas />
            <main id="contenido" className={`mx-auto w-full flex-grow px-4 py-6 sm:py-10 ${ancho === "amplio" ? "max-w-7xl sm:px-8" : "max-w-4xl"}`}>
                {children ?? <Outlet />}
            </main>
            <footer className="mt-8 py-4 text-center text-sm text-tinta-suave">
                <p>
                    © 2026 {NOMBRE_PRODUCTO} · <Link to="/privacidad" className="underline">Aviso de privacidad</Link>
                </p>
            </footer>
        </div>
    );
}

export const LayoutPublico = () => <Marco modulo="publico" />;
export const LayoutDocente = () => <Marco modulo="docente" ancho="amplio" />;
export const LayoutAlumno = () => <Marco modulo="alumno" ancho="amplio" />;
