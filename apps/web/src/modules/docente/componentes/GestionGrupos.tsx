// Grupos del docente y alta de alumnos (05-contratos §4.1, ADR-004, ADR-009).
import { useCallback, useEffect, useState } from "react";
import { AVATARES, ICONOS_PIN } from "@numotion/core/dominio/acceso";
import type { EstadoConsentimiento } from "@numotion/core/dominio/consentimiento";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";

interface Grupo {
    id: string;
    nombre: string;
    grado: number;
    cicloEscolar: string;
    codigoAcceso: string;
    alumnos: number;
}
interface Alumno {
    id: string;
    nombre: string;
    apellidos: string;
    avatar: string;
    estadoConsentimiento: EstadoConsentimiento;
    aceptaCamara: boolean;
}
interface Invitacion {
    url: string;
    expira: string;
}
interface Alta {
    alumno: { id: string; nombre: string; avatar: string };
    pin: string[];
    invitacion: Invitacion;
    correoEnviado: boolean;
}

const ETIQUETA_CONSENTIMIENTO: Record<Alumno["estadoConsentimiento"], [string, string]> = {
    vigente: ["Consentimiento vigente", "bg-exito-suave text-exito"],
    pendiente: ["Esperando al tutor", "bg-acento-suave text-tinta"],
    revocado: ["Revocado", "bg-alerta-suave text-alerta"],
    por_renovar: ["Por renovar", "bg-acento-suave text-tinta"],
    vencido: ["Enlace vencido", "bg-alerta-suave text-alerta"],
};

/** Enlace para el tutor con botón de copiar; avisa si el correo no salió. */
function EnlaceTutor({ invitacion, correoEnviado }: { invitacion: Invitacion; correoEnviado: boolean }) {
    return (
        <>
            <p className="mb-1 font-bold">Enlace de consentimiento para el tutor</p>
            <p className="mb-2 text-sm text-tinta-suave">
                {correoEnviado ? "Se lo enviamos por correo. " : "No se pudo enviar el correo: compártelo por otro medio. "}
                El alumno podrá entrar cuando su madre, padre o tutor acepte. Vence el {new Date(invitacion.expira).toLocaleDateString("es-MX")}.
            </p>
            <div className="flex gap-2">
                <input readOnly value={invitacion.url} aria-label="Enlace de consentimiento" className="campo font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="boton-secundario" onClick={() => navigator.clipboard?.writeText(invitacion.url)}>Copiar</button>
            </div>
        </>
    );
}

const emoji = (lista: readonly { id: string; emoji: string }[], id: string) => lista.find((x) => x.id === id)?.emoji ?? "?";
const nombreIcono = (id: string) => ICONOS_PIN.find((i) => i.id === id)?.nombre ?? id;

function cicloActual(hoy = new Date()): string {
    const a = hoy.getFullYear();
    return hoy.getMonth() >= 7 ? `${a}-${a + 1}` : `${a - 1}-${a}`; // el ciclo SEP inicia en agosto
}

export default function GestionGrupos() {
    const [grupos, setGrupos] = useState<Grupo[] | null>(null);
    const [elegido, setElegido] = useState<string | null>(null);
    const [alumnos, setAlumnos] = useState<Alumno[] | null>(null);
    const [alta, setAlta] = useState<Alta | null>(null);
    const [reenvio, setReenvio] = useState<{ nombre: string; invitacion: Invitacion; correoEnviado: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    const cargarGrupos = useCallback(async () => {
        const r = await api<{ items: Grupo[] }>("GET", "/docente/grupos");
        setGrupos(r.items);
        setElegido((actual) => actual ?? r.items[0]?.id ?? null);
    }, []);

    useEffect(() => {
        cargarGrupos().catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar los grupos."));
    }, [cargarGrupos]);

    useEffect(() => {
        if (!elegido) return setAlumnos(null);
        setAlumnos(null);
        api<{ items: Alumno[] }>("GET", `/docente/grupos/${elegido}/alumnos`)
            .then((r) => setAlumnos(r.items))
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar los alumnos."));
    }, [elegido]);

    async function enviar<T>(e: React.FormEvent<HTMLFormElement>, accion: (f: FormData) => Promise<T>): Promise<T | null> {
        e.preventDefault();
        const form = e.currentTarget;
        setOcupado(true);
        setError(null);
        try {
            const r = await accion(new FormData(form));
            form.reset();
            return r;
        } catch (err) {
            setError(err instanceof ErrorApi ? err.message : "Algo salió mal.");
            return null;
        } finally {
            setOcupado(false);
        }
    }

    const crearGrupo = (e: React.FormEvent<HTMLFormElement>) =>
        enviar(e, async (f) => {
            const g = await api<Grupo>("POST", "/docente/grupos", {
                nombre: f.get("nombre"),
                grado: Number(f.get("grado")),
                cicloEscolar: f.get("cicloEscolar"),
            });
            await cargarGrupos();
            setElegido(g.id);
        });

    const crearAlumno = (e: React.FormEvent<HTMLFormElement>) =>
        enviar(e, async (f) => {
            const r = await api<Alta>("POST", `/docente/grupos/${elegido}/alumnos`, {
                nombre: f.get("nombre"),
                apellidos: f.get("apellidos"),
                tutorNombre: f.get("tutorNombre"),
                tutorEmail: f.get("tutorEmail"),
            });
            setAlta(r);
            const lista = await api<{ items: Alumno[] }>("GET", `/docente/grupos/${elegido}/alumnos`);
            setAlumnos(lista.items);
            await cargarGrupos();
        });

    async function nuevoEnlace(a: Alumno) {
        setError(null);
        setAlta(null);
        try {
            const r = await api<{ invitacion: Invitacion; correoEnviado: boolean }>("POST", `/docente/alumnos/${a.id}/invitacion`);
            setReenvio({ nombre: a.nombre, ...r });
            const lista = await api<{ items: Alumno[] }>("GET", `/docente/grupos/${elegido}/alumnos`);
            setAlumnos(lista.items);
        } catch (err) {
            setError(err instanceof ErrorApi ? err.message : "No se pudo generar el enlace.");
        }
    }

    const grupo = grupos?.find((g) => g.id === elegido);

    return (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
            <aside className="flex flex-col gap-4">
                <section className="tarjeta" aria-labelledby="mis-grupos">
                    <h2 id="mis-grupos" className="mb-3 text-lg font-extrabold">Mis grupos</h2>
                    {!grupos && <p role="status">Cargando…</p>}
                    {grupos?.length === 0 && <p className="text-tinta-suave">Aún no tienes grupos.</p>}
                    <ul className="flex flex-col gap-2">
                        {grupos?.map((g) => (
                            <li key={g.id}>
                                <button
                                    type="button"
                                    aria-current={g.id === elegido ? "true" : undefined}
                                    onClick={() => {
                                        setAlta(null);
                                        setReenvio(null);
                                        setElegido(g.id);
                                    }}
                                    className={`w-full cursor-pointer rounded-xl border-2 px-3 py-2 text-left ${g.id === elegido ? "border-marca bg-marca-suave" : "border-slate-200 hover:border-marca"}`}
                                >
                                    <span className="font-bold">{g.nombre}</span> · {g.grado}.º · {g.alumnos} alumnos
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
                <form onSubmit={crearGrupo} className="tarjeta flex flex-col gap-3" aria-labelledby="nuevo-grupo">
                    <h2 id="nuevo-grupo" className="text-lg font-extrabold">Nuevo grupo</h2>
                    <div>
                        <label htmlFor="g-nombre" className="etiqueta">Nombre</label>
                        <input id="g-nombre" name="nombre" required maxLength={40} placeholder="3A" className="campo" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label htmlFor="g-grado" className="etiqueta">Grado</label>
                            <select id="g-grado" name="grado" className="campo" defaultValue="3">
                                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}.º</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="g-ciclo" className="etiqueta">Ciclo</label>
                            <input id="g-ciclo" name="cicloEscolar" required pattern="\d{4}-\d{4}" defaultValue={cicloActual()} className="campo" />
                        </div>
                    </div>
                    <button type="submit" className="boton" disabled={ocupado}>Crear grupo</button>
                </form>
            </aside>

            <div className="flex flex-col gap-4">
                {error && <Aviso tipo="error">{error}</Aviso>}
                {grupo && (
                    <section className="tarjeta" aria-labelledby="grupo-actual">
                        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                            <h1 id="grupo-actual" className="text-2xl font-extrabold">Grupo {grupo.nombre} <span className="text-base font-semibold text-tinta-suave">· {grupo.cicloEscolar}</span></h1>
                            <p>
                                Código para entrar: <strong className="rounded-lg bg-acento-suave px-2 py-1 font-mono text-xl tracking-widest">{grupo.codigoAcceso}</strong>
                            </p>
                        </div>
                        {!alumnos && <p role="status">Cargando alumnos…</p>}
                        {alumnos?.length === 0 && <p className="text-tinta-suave">Este grupo aún no tiene alumnos.</p>}
                        {alumnos && alumnos.length > 0 && (
                            <table className="w-full text-left">
                                <caption className="sr-only">Alumnos del grupo {grupo.nombre}</caption>
                                <thead>
                                    <tr className="border-b border-slate-200 text-sm text-tinta-suave">
                                        <th scope="col" className="py-2">Alumno</th>
                                        <th scope="col" className="py-2">Consentimiento</th>
                                        <th scope="col" className="py-2">Cámara</th>
                                        <th scope="col" className="py-2"><span className="sr-only">Acciones</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alumnos.map((a) => {
                                        const [texto, clase] = ETIQUETA_CONSENTIMIENTO[a.estadoConsentimiento];
                                        return (
                                            <tr key={a.id} className="border-b border-slate-100">
                                                <td className="py-2"><span aria-hidden="true" className="mr-2 text-2xl">{emoji(AVATARES, a.avatar)}</span>{a.nombre} {a.apellidos}</td>
                                                <td className="py-2"><span className={`insignia-estado ${clase}`}>{texto}</span></td>
                                                <td className="py-2">{a.aceptaCamara ? "Sí" : "No"}</td>
                                                <td className="py-2 text-right">
                                                    {a.estadoConsentimiento !== "vigente" && (
                                                        <button type="button" className="cursor-pointer text-sm enlace" onClick={() => nuevoEnlace(a)}>
                                                            Nuevo enlace<span className="sr-only"> para el tutor de {a.nombre}</span>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </section>
                )}

                {alta && (
                    <section className="tarjeta border-2 border-exito" aria-labelledby="alta-lista">
                        <h2 id="alta-lista" className="mb-2 text-xl font-extrabold">
                            <span aria-hidden="true">{emoji(AVATARES, alta.alumno.avatar)}</span> {alta.alumno.nombre} ya está en el grupo
                        </h2>
                        <p className="mb-2">Entrégale su clave secreta. <strong>Solo se muestra esta vez.</strong></p>
                        <p className="mb-4 flex gap-2 text-4xl" role="img" aria-label={`Clave: ${alta.pin.map(nombreIcono).join(", ")}`}>
                            {alta.pin.map((p, i) => <span key={i} aria-hidden="true" className="rounded-xl bg-marca-suave p-2">{emoji(ICONOS_PIN, p)}</span>)}
                        </p>
                        <EnlaceTutor invitacion={alta.invitacion} correoEnviado={alta.correoEnviado} />
                    </section>
                )}

                {reenvio && (
                    <section className="tarjeta border-2 border-marca" aria-labelledby="reenvio">
                        <h2 id="reenvio" className="mb-2 text-xl font-extrabold">Nuevo enlace para el tutor de {reenvio.nombre}</h2>
                        <EnlaceTutor invitacion={reenvio.invitacion} correoEnviado={reenvio.correoEnviado} />
                    </section>
                )}

                {grupo && (
                    <form onSubmit={crearAlumno} className="tarjeta grid gap-3 sm:grid-cols-2" aria-labelledby="nuevo-alumno">
                        <h2 id="nuevo-alumno" className="text-lg font-extrabold sm:col-span-2">Agregar alumno a {grupo.nombre}</h2>
                        <div>
                            <label htmlFor="a-nombre" className="etiqueta">Nombre(s)</label>
                            <input id="a-nombre" name="nombre" required minLength={2} maxLength={60} className="campo" />
                        </div>
                        <div>
                            <label htmlFor="a-apellidos" className="etiqueta">Apellidos</label>
                            <input id="a-apellidos" name="apellidos" maxLength={80} className="campo" />
                        </div>
                        <div>
                            <label htmlFor="a-tutor" className="etiqueta">Nombre del tutor</label>
                            <input id="a-tutor" name="tutorNombre" required minLength={3} maxLength={120} className="campo" />
                        </div>
                        <div>
                            <label htmlFor="a-correo" className="etiqueta">Correo del tutor</label>
                            <input id="a-correo" name="tutorEmail" type="email" required className="campo" />
                        </div>
                        <p className="text-sm text-tinta-suave sm:col-span-2">Se le asignan un animal y una clave de 4 dibujos automáticamente.</p>
                        <div className="sm:col-span-2">
                            <button type="submit" className="boton" disabled={ocupado}>Agregar alumno</button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
