// /alumno/sin-permiso (RNF-10, HU-03): sin consentimiento vigente no se crea sesión
import { Link } from "react-router-dom";
import { BotonAudio } from "../shared/ui/BotonAudio";

const MENSAJE = "Pide a tu maestra o maestro que active tu cuenta. Falta el permiso de tu mamá, papá o tutor.";

export default function SinConsentimiento() {
    return (
        <section className="tarjeta mx-auto max-w-xl text-center">
            <p aria-hidden="true" className="text-6xl">✋</p>
            <div className="mt-3 flex items-center justify-center gap-3">
                <h1 className="text-2xl font-extrabold">{MENSAJE}</h1>
                <BotonAudio texto={MENSAJE} />
            </div>
            <Link to="/" className="boton mt-6">Volver</Link>
        </section>
    );
}
