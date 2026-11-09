import { Link } from "react-router-dom";
import { NOMBRE_PRODUCTO } from "@numotion/core/marca";

export default function Inicio() {
    return (
        <section className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-10 text-center">
            <div>
                <h1 className="text-4xl font-extrabold sm:text-5xl">{NOMBRE_PRODUCTO}</h1>
                <p className="mt-3 text-xl text-tinta-suave">Matemáticas a tu ritmo, con atención a cómo te sientes.</p>
            </div>
            <div className="grid w-full gap-4 sm:grid-cols-2">
                <Link to="/alumno/entrar" className="tarjeta flex min-h-40 flex-col items-center justify-center gap-2 text-2xl font-extrabold hover:border-marca hover:bg-marca-suave">
                    <span aria-hidden="true" className="text-6xl">🧒</span> Soy alumno
                </Link>
                <Link to="/docente/entrar" className="tarjeta flex min-h-40 flex-col items-center justify-center gap-2 text-2xl font-extrabold hover:border-marca hover:bg-marca-suave">
                    <span aria-hidden="true" className="text-6xl">👩‍🏫</span> Soy docente
                </Link>
            </div>
        </section>
    );
}
