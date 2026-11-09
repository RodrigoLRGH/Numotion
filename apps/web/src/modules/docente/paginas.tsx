// Páginas del módulo docente (06-navegacion §1). Se cargan en un trozo aparte (code splitting).
import { Link, useParams, useSearchParams } from "react-router-dom";
import ActividadesAsignadas from "./componentes/ActividadesAsignadas";
import FormularioAcceso from "./componentes/FormularioAcceso";
import FormularioAsignacion from "./componentes/FormularioAsignacion";
import GestionGrupos from "./componentes/GestionGrupos";
import FichaAlumno from "./componentes/FichaAlumno";
import Historial from "./componentes/Historial";
import Panel from "./componentes/PanelDocente";
import ReportesTemas from "./componentes/Reportes";

export function LoginDocente() {
    const [params] = useSearchParams();
    return (
        <>
            <FormularioAcceso modo="login" siguiente={params.get("next") ?? undefined} />
            <p className="mt-6 text-center">
                ¿Eres alumno? <Link to="/alumno/entrar" className="font-bold text-marca underline">Entra aquí</Link>
            </p>
        </>
    );
}

export const RegistroDocente = () => <FormularioAcceso modo="registro" />;

// D1 · resumen previo y alertas (EXP-07.1, EXP-05.5); D4 · ficha; D6 · reportes
export const PanelDocente = Panel;
export const Reportes = ReportesTemas;

export function Ficha() {
    const { alumnoId = "" } = useParams();
    return <FichaAlumno key={alumnoId} alumnoId={alumnoId} />;
}

export const Grupos = GestionGrupos;
export const Actividades = ActividadesAsignadas;
export const NuevaActividad = FormularioAsignacion;
export const HistorialActividades = Historial;
