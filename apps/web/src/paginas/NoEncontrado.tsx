import { Link } from "react-router-dom";

export default function NoEncontrado() {
    return (
        <section className="tarjeta text-center">
            <h1 className="text-2xl font-extrabold">No encontramos esta página</h1>
            <Link to="/" className="boton mt-4">Ir al inicio</Link>
        </section>
    );
}
