// Páginas del módulo alumno (06-navegacion §1). Se cargan en un trozo aparte (code splitting) y,
// dentro de él, la pantalla de actividad (motor, tipos de ejercicio, guía y cola sin conexión) va
// en otro: se descarga en segundo plano desde "Mis actividades" (T-03-04-21, P-PERF-01).
import { lazy, Suspense } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import DiagnosticoMatematico from "./componentes/DiagnosticoMatematico";
import EntrarAlumno from "./componentes/EntrarAlumno";
import MisActividades from "./componentes/MisActividades";
import PanasC from "./componentes/PanasC";
import Panel from "./componentes/PanelAlumno";
import PerfilAlumno from "./componentes/PerfilAlumno";
import PracticaLibre from "./componentes/PracticaLibre";
import { cargarResolver } from "./componentes/precarga";

const ResolverActividad = lazy(cargarResolver);

export function Entrar() {
    const [params] = useSearchParams();
    return <EntrarAlumno siguiente={params.get("next") ?? undefined} />;
}

export const Panas = PanasC;
export const Matematico = DiagnosticoMatematico;

// Panel con racha, nivel, insignias y frase del día (EXP-06); perfil y práctica libre
export const PanelAlumno = Panel;
export const Perfil = PerfilAlumno;
export const Practica = PracticaLibre;

export const Actividades = MisActividades;

export function Resolver() {
    const { asignacionId = "" } = useParams();
    return (
        <Suspense fallback={<p className="text-center text-xl" role="status">Preparando tu actividad…</p>}>
            <ResolverActividad key={asignacionId} asignacionId={asignacionId} />
        </Suspense>
    );
}
