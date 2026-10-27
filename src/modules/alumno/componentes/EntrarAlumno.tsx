// A1 · Entrar (ADR-004): código del grupo → ¿quién eres? → clave de 4 íconos.
// Completable sin leer (íconos + audio, EXP-01.4). Los íconos del PIN no se leen en voz
// alta para que los compañeros no escuchen la clave.
import { useRef, useState } from "react";
import { AVATARES, ICONOS_PIN, LONGITUD_PIN, normalizarCodigo } from "../../shared/dominio/acceso";
import { api, ErrorApi, irA } from "../../shared/cliente/api";
import { Aviso } from "../../shared/ui/Aviso";
import { BotonAudio } from "../../shared/ui/BotonAudio";

interface Grupo {
    grupoId: string;
    alumnos: { id: string; avatar: string; nombreCorto: string }[];
}

type Paso = { tipo: "codigo" } | { tipo: "avatar"; grupo: Grupo } | { tipo: "pin"; grupo: Grupo; alumno: Grupo["alumnos"][number] };

const emojiAvatar = (id: string) => AVATARES.find((a) => a.id === id)?.emoji ?? "🙂";

export default function EntrarAlumno({ siguiente }: { siguiente?: string }) {
    const [paso, setPaso] = useState<Paso>({ tipo: "codigo" });
    const [codigo, setCodigo] = useState("");
    const [pin, setPin] = useState<string[]>([]);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const enviando = useRef(false);

    async function buscarGrupo(e: React.FormEvent) {
        e.preventDefault();
        const normal = normalizarCodigo(codigo);
        if (!normal) return setMensaje("El código tiene 6 letras o números.");
        setOcupado(true);
        setMensaje(null);
        try {
            const grupo = await api<Grupo>("GET", `/auth/alumno/grupo/${normal}`);
            setPaso({ tipo: "avatar", grupo });
        } catch (err) {
            setMensaje(err instanceof ErrorApi ? err.message : "Algo salió mal.");
        } finally {
            setOcupado(false);
        }
    }

    async function entrar(grupo: Grupo, alumnoId: string, clave: string[]) {
        if (enviando.current) return;
        enviando.current = true;
        setOcupado(true);
        try {
            const r = await api<{ destino: string }>("POST", "/auth/alumno/login", { grupoId: grupo.grupoId, alumnoId, pin: clave, siguiente });
            irA(r.destino);
        } catch (err) {
            setPin([]);
            setMensaje(err instanceof ErrorApi ? err.message : "Algo salió mal.");
            setOcupado(false);
        } finally {
            enviando.current = false;
        }
    }

    function tocarIcono(id: string) {
        if (paso.tipo !== "pin" || ocupado || pin.length >= LONGITUD_PIN) return;
        setMensaje(null);
        const nuevo = [...pin, id];
        setPin(nuevo);
        if (nuevo.length === LONGITUD_PIN) void entrar(paso.grupo, paso.alumno.id, nuevo);
    }

    if (paso.tipo === "codigo") {
        return (
            <form onSubmit={buscarGrupo} className="tarjeta mx-auto flex max-w-lg flex-col items-center gap-5 text-center" noValidate>
                <div className="flex items-center gap-3">
                    <h1 className="text-3xl font-extrabold">Escribe el código de tu grupo</h1>
                    <BotonAudio texto="Escribe el código de tu grupo. Te lo da tu maestra o maestro." />
                </div>
                <label htmlFor="codigo" className="sr-only">Código del grupo</label>
                <input
                    id="codigo"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 7))}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    placeholder="ABC234"
                    className="campo w-72 text-center font-mono text-4xl tracking-[0.4em] uppercase"
                />
                {mensaje && <Aviso tipo="error">{mensaje}</Aviso>}
                <button type="submit" className="boton min-h-14 px-8 text-2xl" disabled={ocupado || codigo.trim().length < 6}>
                    Seguir <span aria-hidden="true">➜</span>
                </button>
            </form>
        );
    }

    if (paso.tipo === "avatar") {
        return (
            <section className="tarjeta mx-auto max-w-3xl" aria-labelledby="quien">
                <div className="mb-5 flex items-center justify-center gap-3">
                    <h1 id="quien" className="text-3xl font-extrabold">¿Quién eres?</h1>
                    <BotonAudio texto="¿Quién eres? Toca tu animal." />
                </div>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="list">
                    {paso.grupo.alumnos.map((a) => (
                        <li key={a.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    setPin([]);
                                    setMensaje(null);
                                    setPaso({ tipo: "pin", grupo: paso.grupo, alumno: a });
                                }}
                                className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-slate-200 bg-white p-3 hover:border-marca hover:bg-marca-suave"
                            >
                                <span aria-hidden="true" className="text-5xl">{emojiAvatar(a.avatar)}</span>
                                <span className="text-xl font-bold">{a.nombreCorto}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="mt-5 text-center">
                    <button type="button" className="boton-secundario" onClick={() => setPaso({ tipo: "codigo" })}>
                        <span aria-hidden="true">←</span> Otro código
                    </button>
                </div>
            </section>
        );
    }

    return (
        <section className="tarjeta mx-auto max-w-xl text-center" aria-labelledby="clave">
            <p className="text-5xl" aria-hidden="true">{emojiAvatar(paso.alumno.avatar)}</p>
            <p className="text-xl font-bold">{paso.alumno.nombreCorto}</p>
            <div className="my-4 flex items-center justify-center gap-3">
                <h1 id="clave" className="text-3xl font-extrabold">Toca tu clave secreta</h1>
                <BotonAudio texto="Toca tus cuatro dibujos secretos, en orden." />
            </div>
            <p className="sr-only" aria-live="polite">{`${pin.length} de ${LONGITUD_PIN} dibujos`}</p>
            <div className="mb-4 flex justify-center gap-3" aria-hidden="true">
                {Array.from({ length: LONGITUD_PIN }, (_, i) => (
                    <span key={i} aria-hidden="true" className={`size-6 rounded-full border-4 border-marca ${i < pin.length ? "bg-marca" : "bg-white"}`} />
                ))}
            </div>
            {mensaje && <div className="mb-4"><Aviso tipo="error">{mensaje}</Aviso></div>}
            <div className="mx-auto grid max-w-md grid-cols-4 gap-3">
                {ICONOS_PIN.map((i) => (
                    <button
                        key={i.id}
                        type="button"
                        aria-label={i.nombre}
                        disabled={ocupado}
                        onClick={() => tocarIcono(i.id)}
                        className="flex aspect-square min-h-16 cursor-pointer items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-4xl hover:border-marca hover:bg-marca-suave disabled:opacity-50"
                    >
                        <span aria-hidden="true">{i.emoji}</span>
                    </button>
                ))}
            </div>
            <div className="mt-5 flex justify-center gap-3">
                <button type="button" className="boton-secundario" onClick={() => setPaso({ tipo: "avatar", grupo: paso.grupo })}>
                    <span aria-hidden="true">←</span> No soy yo
                </button>
                <button type="button" className="boton-secundario" disabled={!pin.length || ocupado} onClick={() => setPin(pin.slice(0, -1))} aria-label="Borrar el último">
                    <span aria-hidden="true">⌫</span> Borrar
                </button>
            </div>
        </section>
    );
}
