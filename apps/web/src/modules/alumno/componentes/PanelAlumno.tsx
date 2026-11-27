// A3 · Panel principal del alumno (RF-63, RF-22, RF-66, RF-64), según Figma "006_Dashboard del alumno":
// personaje, nivel e insignias, mensaje del día, racha L–V con "Activar racha" y mis actividades.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { Icono } from "../../../shared/ui/Icono";
import { BarraNivel, FilaInsignias, MensajeMotivacional, Personaje, RachaVisual, type DiaSemana, type Gamificacion, type Insignia } from "./Gamificacion";
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
    const racha = p?.racha.actual ?? 0;

    return (
        <div className="flex flex-col gap-6">
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!p && !error && <p role="status">Cargando tu panel…</p>}
            {p && (
                <>
                    <section aria-labelledby="saludo" className="tarjeta flex flex-wrap items-center gap-4 sm:rounded-[3rem] sm:p-8">
                        <Personaje g={p.gamificacion} />
                        <div className="flex-grow">
                            <h1 id="saludo" className="text-3xl font-bold">¡Hola, {primerNombre}!</h1>
                            <BarraNivel g={p.gamificacion} />
                        </div>
                        {/* Insignias a la derecha de la barra de nivel */}
                        <Link
                            to="/alumno/perfil#insignias"
                            aria-label={`Mis insignias (${p.insignias.length})`}
                            className="flex flex-col items-center gap-1 rounded-2xl px-3 py-2 hover:bg-neutro"
                        >
                            <span className="text-lg font-bold">
                                Insignias<span className="sr-only"> ({p.insignias.length})</span>
                            </span>
                            <FilaInsignias obtenidas={p.insignias} />
                        </Link>
                    </section>
                    {p.mensajeMotivacional && <MensajeMotivacional texto={p.mensajeMotivacional} />}
                    {/* Calendario de racha encima de las actividades, con "Activar racha" arriba a la derecha */}
                    <RachaVisual
                        {...p.racha}
                        accion={
                            <Link
                                to="/alumno/practica"
                                className={`inline-flex min-h-14 items-center gap-3 rounded-full px-6 text-xl ${
                                    racha > 0 ? "bg-acento" : "border border-tinta bg-white hover:bg-marca-tenue"
                                }`}
                            >
                                <Icono nombre="fuego" className="text-3xl" />
                                <span className="text-3xl font-bold text-tinta-suave">{racha}</span>
                                Activar racha
                                <span className="sr-only">(Jugar libre)</span>
                            </Link>
                        }
                    />
                </>
            )}
            <MisActividades />
        </div>
    );
}
