// Estructura común de todas las pantallas: encabezado con navegación por rol, contenido y pie.
// El módulo alumno usa tipografía base de 20 px y objetivos de 48 px (04-arquitectura §7).
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { NOMBRE_PRODUCTO } from "@numotion/core/marca";
import { useAuth } from "./auth";

const ENLACES = {
    docente: [
        { to: "/docente", texto: "Panel", fin: true },
        { to: "/docente/grupos", texto: "Grupos" },
        { to: "/docente/actividades", texto: "Actividades" },
        { to: "/docente/historial", texto: "Historial" },
        { to: "/docente/reportes", texto: "Reportes" },
    ],
    alumno: [
        { to: "/alumno", texto: "🏠 Mi panel", fin: true },
        { to: "/alumno/practica", texto: "🎮 Jugar" },
        { to: "/alumno/perfil", texto: "👤 Perfil" },
    ],
} as const;

function Encabezado() {
    const { usuario, salir } = useAuth();
    const navegar = useNavigate();
    const enlaces = usuario ? ENLACES[usuario.rol] : [];
    return (
        <header className="bg-marca text-white">
            <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded focus:bg-white focus:px-3 focus:py-1 focus:text-marca">
                Saltar al contenido
            </a>
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link to={usuario ? `/${usuario.rol}` : "/"} className="text-2xl font-extrabold tracking-tight">
                    {NOMBRE_PRODUCTO}
                </Link>
                {usuario && (
                    <nav aria-label="Principal" className="flex flex-wrap items-center gap-1">
                        {enlaces.map((e) => (
                            <NavLink
                                key={e.to}
                                to={e.to}
                                end={"fin" in e && e.fin}
                                className={({ isActive }) =>
                                    // hover con marca-fuerte (no blanco translúcido): mantiene el texto blanco ≥ 4.5:1
                                    `rounded-lg px-3 py-2 font-semibold hover:bg-marca-fuerte ${isActive ? "bg-marca-fuerte underline underline-offset-4" : ""}`
                                }
                            >
                                {e.texto}
                            </NavLink>
                        ))}
                        <span className="mx-2 hidden text-sm opacity-90 sm:inline">{usuario.nombre}</span>
                        <button
                            type="button"
                            onClick={async () => {
                                await salir();
                                navegar("/", { replace: true });
                            }}
                            className="min-h-11 cursor-pointer rounded-lg border border-white/60 px-3 py-1.5 text-sm font-bold hover:bg-white/15"
                        >
                            Salir
                        </button>
                    </nav>
                )}
            </div>
        </header>
    );
}

export function Marco({ children, modulo = "publico", ancho = "normal" }: { children?: ReactNode; modulo?: "alumno" | "docente" | "publico"; ancho?: "normal" | "amplio" }) {
    return (
        <div className={`flex min-h-screen flex-col bg-fondo font-sans ${modulo === "alumno" ? "text-xl" : ""}`} data-modulo={modulo}>
            <Encabezado />
            <main id="contenido" className={`mx-auto w-full flex-grow px-4 py-6 ${ancho === "amplio" ? "max-w-6xl" : "max-w-4xl"}`}>
                {children ?? <Outlet />}
            </main>
            <footer className="mt-8 py-4 text-center text-sm text-tinta-suave">
                <p>
                    © 2026 {NOMBRE_PRODUCTO} · Proyecto TEDS · <Link to="/privacidad" className="underline">Aviso de privacidad</Link>
                </p>
            </footer>
        </div>
    );
}

export const LayoutPublico = () => <Marco modulo="publico" />;
export const LayoutDocente = () => <Marco modulo="docente" ancho="amplio" />;
export const LayoutAlumno = () => <Marco modulo="alumno" />;
