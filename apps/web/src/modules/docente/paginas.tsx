// Páginas del módulo docente (06-navegacion §1). Se cargan en un trozo aparte (code splitting).
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/auth";
import ActividadesAsignadas from "./componentes/ActividadesAsignadas";
import FormularioAcceso from "./componentes/FormularioAcceso";
import FormularioAsignacion from "./componentes/FormularioAsignacion";
import GestionGrupos from "./componentes/GestionGrupos";
import Historial from "./componentes/Historial";

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

// Provisional: el resumen previo del grupo (D1) llega con EXP-07
export function PanelDocente() {
    const { usuario } = useAuth();
    return (
        <section className="tarjeta">
            <h1 className="text-2xl font-extrabold">Hola, {usuario?.nombre}</h1>
            <p className="mt-2 text-tinta-suave">El resumen de cómo llega tu grupo cada día aparecerá aquí.</p>
            <Link to="/docente/grupos" className="boton mt-4">Ver mis grupos y alumnos</Link>
        </section>
    );
}

export const Grupos = GestionGrupos;
export const Actividades = ActividadesAsignadas;
export const NuevaActividad = FormularioAsignacion;
export const HistorialActividades = Historial;
