// Pantalla de entrada (Figma "0003_Iniciar_o_Registrar"): panel celeste con el ícono de usuario y dos botones.
import { Link } from "react-router-dom";
import iconoUsuario from "../assets/figma/usuario-inicio.svg";

export default function Inicio() {
    return (
        <section className="mx-auto flex max-w-xl flex-col items-center gap-8 rounded-[3rem] bg-marca-panel px-6 py-12 text-center sm:rounded-[79px] sm:px-16">
            <img src={iconoUsuario} alt="" width={200} height={200} className="size-36 sm:size-[200px]" />
            <div>
                <h1 className="sr-only">Bienvenida a Numotion</h1>
                <p className="text-xl font-semibold">Aprender también se atiende</p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-6">
                <Link to="/alumno/entrar" className="boton w-full">
                    Soy alumno
                </Link>
                <Link to="/docente/entrar" className="boton w-full">
                    Soy docente
                </Link>
            </div>
        </section>
    );
}
