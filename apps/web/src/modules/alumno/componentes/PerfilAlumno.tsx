// A7 · Perfil del alumno (RF-65): nombre, grado, grupo, personaje, nivel e insignias.
// Sin datos emocionales ni comparaciones con otros alumnos.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { BotonAudio } from "../../../shared/ui/BotonAudio";
import { BarraNivel, ListaInsignias, Personaje, type Gamificacion, type Insignia } from "./Gamificacion";

interface Perfil {
    nombre: string;
    grado: number;
    grupo: string;
    gamificacion: Gamificacion;
    insignias: Insignia[];
    insigniasPorGanar: Insignia[];
    racha: { actual: number; mejor: number };
}

export default function PerfilAlumno() {
    const [p, setP] = useState<Perfil | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<Perfil>("GET", "/alumno/perfil")
            .then(setP)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tu perfil."));
    }, []);

    useEffect(() => {
        if (p && window.location.hash === "#insignias") document.getElementById("insignias")?.scrollIntoView();
    }, [p]);

    if (error) return <Aviso tipo="error">{error}</Aviso>;
    if (!p) return <p role="status">Cargando tu perfil…</p>;

    const g = p.gamificacion;
    return (
        <div className="flex flex-col gap-5">
            <section aria-labelledby="mi-perfil" className="tarjeta flex flex-col items-center gap-3 text-center">
                <Personaje g={g} tamano="grande" />
                <h1 id="mi-perfil" className="text-4xl font-extrabold">{p.nombre}</h1>
                <p className="text-xl">
                    {p.grado}.º grado · Grupo {p.grupo}
                </p>
                <div className="w-full max-w-md text-left">
                    <BarraNivel g={g} />
                </div>
                <p className="text-xl">
                    <span aria-hidden="true">🔥 </span>Mejor racha: <strong>{p.racha.mejor}</strong> {p.racha.mejor === 1 ? "día" : "días"}
                </p>
            </section>

            {g.personaje.accesorios.length > 0 && (
                <section aria-labelledby="accesorios" className="tarjeta">
                    <h2 id="accesorios" className="mb-3 text-2xl font-extrabold">Accesorios de tu {g.personaje.nombre}</h2>
                    <ul className="flex flex-wrap gap-3">
                        {g.personaje.accesorios.map((a) => (
                            <li key={a.nivel} className="flex items-center gap-2 rounded-xl bg-acento-suave px-3 py-2">
                                <span aria-hidden="true" className="text-3xl">{a.emoji}</span> {a.nombre}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section aria-labelledby="insignias-titulo" id="insignias" className="tarjeta">
                <div className="mb-3 flex items-center gap-3">
                    <h2 id="insignias-titulo" className="text-2xl font-extrabold">Mis insignias ({p.insignias.length})</h2>
                    <BotonAudio
                        texto={p.insignias.length ? `Tienes ${p.insignias.length} insignias: ${p.insignias.map((i) => i.nombre).join(", ")}.` : "Todavía no tienes insignias. ¡Juega para ganarlas!"}
                        etiqueta="Escuchar mis insignias"
                    />
                </div>
                <ListaInsignias obtenidas={p.insignias} pendientes={p.insigniasPorGanar} />
            </section>

            <Link to="/alumno" className="boton-secundario self-center">← Volver a mi panel</Link>
        </div>
    );
}
