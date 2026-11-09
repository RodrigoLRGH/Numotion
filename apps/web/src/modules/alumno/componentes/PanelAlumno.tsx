// A3 · Panel principal del alumno (RF-63, RF-22, RF-66, RF-64): personaje y nivel, mensaje del día,
// racha L–V, mis actividades y accesos a práctica libre, insignias y perfil.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { BarraNivel, MensajeMotivacional, Personaje, RachaVisual, type DiaSemana, type Gamificacion, type Insignia } from "./Gamificacion";
import MisActividades from "./MisActividades";

interface Panel {
    nombre: string;
    mensajeMotivacional: string | null;
    racha: { actual: number; mejor: number; semana: DiaSemana[] };
    gamificacion: Gamificacion;
    insignias: Insignia[];
    actividades: { pendientes: number; enCurso: number };
}

export default function PanelAlumno() {
    const [p, setP] = useState<Panel | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api<Panel>("GET", "/alumno/panel")
            .then(setP)
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No pudimos cargar tu panel."));
    }, []);

    const primerNombre = p?.nombre.split(" ")[0];

    return (
        <div className="flex flex-col gap-5">
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!p && !error && <p role="status">Cargando tu panel…</p>}
            {p && (
                <>
                    <section aria-labelledby="saludo" className="tarjeta flex flex-wrap items-center gap-4">
                        <Personaje g={p.gamificacion} />
                        <div className="flex-grow">
                            <h1 id="saludo" className="text-3xl font-extrabold">¡Hola, {primerNombre}! <span aria-hidden="true">👋</span></h1>
                            <BarraNivel g={p.gamificacion} />
                        </div>
                    </section>
                    {p.mensajeMotivacional && <MensajeMotivacional texto={p.mensajeMotivacional} />}
                    <RachaVisual {...p.racha} />
                </>
            )}
            <MisActividades />
            <nav aria-label="Más cosas para hacer" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Link to="/alumno/practica" className="tarjeta flex min-h-20 items-center gap-3 text-2xl font-extrabold hover:border-marca">
                    <span aria-hidden="true" className="text-4xl">🎮</span> Jugar libre
                </Link>
                <Link to="/alumno/perfil#insignias" className="tarjeta flex min-h-20 items-center gap-3 text-2xl font-extrabold hover:border-marca">
                    <span aria-hidden="true" className="text-4xl">🏅</span> Mis insignias {p ? <span className="text-tinta-suave">({p.insignias.length})</span> : null}
                </Link>
                <Link to="/alumno/perfil" className="tarjeta flex min-h-20 items-center gap-3 text-2xl font-extrabold hover:border-marca">
                    <span aria-hidden="true" className="text-4xl">👤</span> Mi perfil
                </Link>
            </nav>
        </div>
    );
}
