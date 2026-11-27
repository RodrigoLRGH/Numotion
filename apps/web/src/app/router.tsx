// Mapa de rutas y guardas (06-navegacion §1–§2). Docente y alumno se cargan en trozos separados:
// el alumno nunca descarga el código del docente (04-arquitectura §8).
import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import Inicio from "../paginas/Inicio";
import NoEncontrado from "../paginas/NoEncontrado";
import Privacidad from "../paginas/Privacidad";
import SinConsentimiento from "../paginas/SinConsentimiento";
import { RedirectIfAuth, RequireCamara, RequireConsent, RequireDiagnosticos, RequirePanas, RequireRole } from "./guardas";
import { LayoutAdmin, LayoutAlumno, LayoutDocente, LayoutPublico } from "./Marco";

type Docente = typeof import("../modules/docente/paginas");
type Alumno = typeof import("../modules/alumno/paginas");
type Admin = typeof import("../modules/admin/paginas");
const docente = () => import("../modules/docente/paginas");
const alumno = () => import("../modules/alumno/paginas");
const admin = () => import("../modules/admin/paginas");
const PaginaConsentimiento = lazy(() => import("../modules/publico/PaginaConsentimiento"));

const cargando = <p role="status" className="p-6 text-center text-xl">Cargando…</p>;

// Un componente perezoso por página, creado una sola vez
function perezosa<M>(cargar: () => Promise<M>, nombre: keyof M) {
    const C = lazy(async () => ({ default: (await cargar())[nombre] as ComponentType }));
    return (
        <Suspense fallback={cargando}>
            <C />
        </Suspense>
    );
}
const d = (nombre: keyof Docente) => perezosa(docente, nombre);
const a = (nombre: keyof Alumno) => perezosa(alumno, nombre);
const ad = (nombre: keyof Admin) => perezosa(admin, nombre);

export const rutas: RouteObject[] = [
    {
        element: <LayoutPublico />,
        children: [
            { path: "/", element: <Inicio /> },
            { path: "/privacidad", element: <Privacidad /> },
            { path: "/consentimiento/:token", element: <Suspense fallback={cargando}><PaginaConsentimiento /></Suspense> },
            { path: "/alumno/sin-permiso", element: <SinConsentimiento /> },
            { path: "*", element: <NoEncontrado /> },
        ],
    },
    {
        path: "/docente",
        element: <LayoutDocente />,
        children: [
            { path: "entrar", element: <RedirectIfAuth>{d("LoginDocente")}</RedirectIfAuth> },
            { path: "registro", element: <RedirectIfAuth>{d("RegistroDocente")}</RedirectIfAuth> },
            {
                element: <RequireRole role="docente" />,
                children: [
                    { index: true, element: d("PanelDocente") },
                    { path: "grupos", element: d("Grupos") },
                    { path: "actividades", element: d("Actividades") },
                    { path: "actividades/nueva", element: d("NuevaActividad") },
                    { path: "historial", element: d("HistorialActividades") },
                    { path: "alumnos/:alumnoId", element: d("Ficha") },
                    { path: "reportes", element: d("Reportes") },
                    { path: "retroalimentaciones", element: d("Retroalimentaciones") },
                    { path: "retroalimentaciones/:retroId", element: d("Retroalimentacion") },
                ],
            },
        ],
    },
    {
        path: "/alumno",
        element: <LayoutAlumno />,
        children: [
            {
                // RC-03: el alumno solo usa la plataforma en un dispositivo con cámara
                element: <RequireCamara />,
                children: [
                    { path: "entrar", element: <RedirectIfAuth>{a("Entrar")}</RedirectIfAuth> },
                    {
                        element: <RequireRole role="alumno" />,
                        children: [
                            {
                                element: <RequireConsent />,
                                children: [
                                    { path: "diagnostico/emocional", element: a("Panas") },
                                    { element: <RequirePanas />, children: [{ path: "diagnostico/matematico", element: a("Matematico") }] },
                                    {
                                        element: <RequireDiagnosticos />,
                                        children: [
                                            { index: true, element: a("PanelAlumno") },
                                            { path: "actividades", element: a("Actividades") },
                                            { path: "actividades/:asignacionId", element: a("Resolver") },
                                            { path: "perfil", element: a("Perfil") },
                                            { path: "practica", element: a("Practica") },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        // Atención de solicitudes ARCO (RC-07). Sin enlace público: se entra por /admin/entrar
        path: "/admin",
        element: <LayoutAdmin />,
        children: [
            { path: "entrar", element: <RedirectIfAuth>{ad("LoginAdmin")}</RedirectIfAuth> },
            { element: <RequireRole role="admin" />, children: [{ index: true, element: ad("SolicitudesArco") }] },
        ],
    },
];

export const crearRouter = () => createBrowserRouter(rutas);
