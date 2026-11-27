// A7 · Perfil del alumno (RF-65), según Figma "008_Perfil": "Mi perfil", tarjetas de
// racha y mejor racha a la derecha del nivel, y panel de insignias ("Salir" está en el encabezado).
// Sin datos emocionales ni comparaciones con otros alumnos.
import { useEffect, useState } from "react";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { Icono } from "../../../shared/ui/Icono";
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
        <div className="flex flex-col gap-6">
            <p aria-hidden="true" className="text-center text-2xl font-bold uppercase">Mi perfil</p>

            <section aria-labelledby="mi-perfil" className="flex flex-col items-center gap-3 text-center">
                <Personaje g={g} tamano="grande" />
                <h1 id="mi-perfil" className="text-4xl font-bold">{p.nombre}</h1>
                <p className="text-xl">
                    {p.grado}.º grado · Grupo {p.grupo}
                </p>
                {/* Nivel a la izquierda y tarjetas de racha a la derecha */}
                <div className="mt-3 grid w-full items-stretch gap-6 md:grid-cols-2">
                    {/* Nivel en su propia tarjeta, de la misma altura que las de racha */}
                    <div className="flex h-full w-full items-center rounded-[2rem] bg-superficie px-6 py-5 text-left">
                        <BarraNivel g={g} gruesa />
                    </div>
                    <div className="grid w-full grid-cols-2 gap-4">
                        <section aria-labelledby="racha-titulo" className="flex flex-col items-center justify-center gap-1 rounded-[2rem] bg-acento px-4 py-5">
                            <h2 id="racha-titulo" className="text-lg font-bold uppercase">Racha</h2>
                            <p className="flex items-center gap-2 text-5xl font-bold">
                                <Icono nombre="fuego" />
                                {p.racha.actual}
                                <span className="text-xl font-normal">{p.racha.actual === 1 ? "día" : "días"}</span>
                            </p>
                        </section>
                        <section aria-labelledby="mejor-racha-titulo" className="flex flex-col items-center justify-center gap-1 rounded-[2rem] bg-acento-suave px-4 py-5">
                            <h2 id="mejor-racha-titulo" className="text-lg font-bold uppercase">Mejor racha</h2>
                            <p className="flex items-center gap-2 text-5xl font-bold">
                                <Icono nombre="trofeo" />
                                {p.racha.mejor}
                                <span className="text-xl font-normal">{p.racha.mejor === 1 ? "día" : "días"}</span>
                            </p>
                        </section>
                    </div>
                </div>
            </section>

            {/* Panel "Insignias" en el mismo gris que la tarjeta de nivel */}
            <section aria-labelledby="insignias-titulo" id="insignias" className="rounded-[2rem] bg-superficie p-6">
                <h2 id="insignias-titulo" className="mb-3 text-center text-2xl font-bold">Mis insignias ({p.insignias.length})</h2>
                <ListaInsignias obtenidas={p.insignias} pendientes={p.insigniasPorGanar} />
            </section>

            {g.personaje.accesorios.length > 0 && (
                <section aria-labelledby="accesorios" className="tarjeta">
                    <h2 id="accesorios" className="mb-3 text-2xl font-bold">Accesorios de tu {g.personaje.nombre}</h2>
                    <ul className="flex flex-wrap gap-3">
                        {g.personaje.accesorios.map((a) => (
                            <li key={a.nivel} className="flex items-center gap-2 rounded-xl bg-acento-suave px-3 py-2">
                                <span aria-hidden="true" className="text-3xl">{a.emoji}</span> {a.nombre}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
