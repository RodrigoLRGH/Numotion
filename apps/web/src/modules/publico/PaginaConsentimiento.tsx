// /consentimiento/:token — pública. Sin sesión: el token del enlace identifica el consentimiento.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../shared/cliente/api";
import ConsentimientoTutor, { type Vista } from "./ConsentimientoTutor";

export default function PaginaConsentimiento() {
    const { token = "" } = useParams();
    const [vista, setVista] = useState<Vista | null | undefined>(undefined);

    useEffect(() => {
        // El token es una credencial: que no salga por Referer a los enlaces de esta página
        const meta = document.createElement("meta");
        meta.name = "referrer";
        meta.content = "no-referrer";
        document.head.appendChild(meta);
        api<Vista>("GET", `/consentimiento/${encodeURIComponent(token)}`)
            .then(setVista)
            .catch(() => setVista(null));
        return () => meta.remove();
    }, [token]);

    if (vista === undefined) return <p role="status">Cargando…</p>;
    if (!vista) {
        return (
            <section className="tarjeta">
                <h1 className="text-2xl font-extrabold">Este enlace no es válido</h1>
                <p className="mt-2">Pide un enlace nuevo a la maestra o maestro de tu hija o hijo.</p>
            </section>
        );
    }
    return <ConsentimientoTutor token={token} vista={vista} />;
}
