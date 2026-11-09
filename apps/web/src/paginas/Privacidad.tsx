import { NOMBRE_PRODUCTO } from "@numotion/core/marca";

export default function Privacidad() {
    return (
        <article className="tarjeta">
            <h1 className="mb-3 text-2xl font-extrabold">Aviso de privacidad</h1>
            <p className="mb-3">
                El texto definitivo del aviso de privacidad de {NOMBRE_PRODUCTO} está en revisión legal (LFPDPPP y LGDNNA) y se publicará en
                esta página antes de usar la plataforma con alumnos.
            </p>
            <p>Mientras tanto, para dudas sobre el tratamiento de datos escribe a la escuela responsable del grupo.</p>
        </article>
    );
}
