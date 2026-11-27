// Módulo administrador (RC-07, RC-08, RNF-10): acceso y bandeja de solicitudes ARCO y revocaciones.
// Se carga en su propio trozo; no importa nada de los módulos docente ni alumno.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    NOMBRE_TIPO_ARCO,
    PLAZO_ARCO_DIAS_HABILES,
    TIPOS_ANONIMIZABLES,
    type TipoSolicitudArco,
} from "@numotion/core/dominio/consentimiento";
import { api, ErrorApi, irA } from "../../shared/cliente/api";
import { Aviso } from "../../shared/ui/Aviso";

// ───────────── Acceso ─────────────

export function LoginAdmin() {
    const [params] = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    async function enviar(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setOcupado(true);
        setError(null);
        try {
            const r = await api<{ destino: string }>("POST", "/auth/admin/login", {
                email: f.get("email"),
                password: f.get("password"),
                siguiente: params.get("next") ?? undefined,
            });
            irA(r.destino);
        } catch (err) {
            setError(err instanceof ErrorApi ? err.message : "Algo salió mal.");
            setOcupado(false);
        }
    }

    return (
        <form onSubmit={enviar} className="tarjeta mx-auto flex max-w-md flex-col gap-4" aria-labelledby="titulo-admin">
            <h1 id="titulo-admin" className="text-3xl font-bold">Administración</h1>
            <p className="text-tinta-suave">Atención de solicitudes de privacidad (ARCO).</p>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <label className="flex flex-col gap-1 font-semibold">
                Correo
                <input name="email" type="email" required autoComplete="username" className="campo" />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
                Contraseña
                <input name="password" type="password" required autoComplete="current-password" className="campo" />
            </label>
            <button type="submit" className="boton" disabled={ocupado}>{ocupado ? "Entrando…" : "Entrar"}</button>
        </form>
    );
}

// ───────────── Bandeja ARCO ─────────────

interface Solicitud {
    id: string;
    tipo: TipoSolicitudArco;
    detalle: string;
    creadaEn: string;
    limite: string;
    atendidaEn: string | null;
    respuesta: string | null;
    atendidaPor: string | null;
    alumno: { id: string; nombre: string; anonimizado: boolean };
    grupo: string;
    docente: string;
    tutor: { nombre: string; correo: string };
}

const fecha = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const hoyLocal = () => new Date().toLocaleDateString("en-CA");

function Plazo({ limite }: { limite: string }) {
    const vencida = limite < hoyLocal();
    return (
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${vencida ? "bg-alerta-suave text-alerta" : "bg-acento-suave"}`}>
            {vencida ? "Plazo vencido" : "Fecha límite"}: {fecha(limite)}
        </span>
    );
}

function FormularioAtencion({ s, onAtendida }: { s: Solicitud; onAtendida(mensaje: string, tipo: "exito" | "info"): void }) {
    const [respuesta, setRespuesta] = useState("");
    const [anonimizar, setAnonimizar] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const puedeAnonimizar = TIPOS_ANONIMIZABLES.includes(s.tipo) && !s.alumno.anonimizado;

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        setOcupado(true);
        setError(null);
        try {
            const r = await api<{ correoEnviado: boolean }>("POST", `/admin/arco/${s.id}/atender`, { respuesta, anonimizar });
            onAtendida(
                r.correoEnviado
                    ? "Solicitud atendida. Enviamos la respuesta al tutor por correo."
                    : `Solicitud atendida, pero no se pudo enviar el correo. Contacta al tutor por otro medio (${s.tutor.correo}).`,
                r.correoEnviado ? "exito" : "info",
            );
        } catch (err) {
            setError(err instanceof ErrorApi ? err.message : "No se pudo guardar.");
            setOcupado(false);
        }
    }

    return (
        <form onSubmit={enviar} className="mt-4 flex flex-col gap-3 border-t border-neutro pt-4">
            {error && <Aviso tipo="error">{error}</Aviso>}
            <label className="flex flex-col gap-1 font-semibold">
                Respuesta para el tutor
                <textarea
                    value={respuesta}
                    onChange={(e) => setRespuesta(e.target.value)}
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    className="campo font-normal"
                    placeholder="Qué se hizo con la solicitud. Se envía por correo al tutor."
                />
            </label>
            {puedeAnonimizar && (
                <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1 size-5" checked={anonimizar} onChange={(e) => setAnonimizar(e.target.checked)} />
                    <span>
                        <span className="font-semibold">Borrar los datos personales del alumno</span>
                        <span className="block text-sm text-tinta-suave">
                            Borra nombre, clave, intereses, notas del docente y lecturas de la cámara, y cierra su acceso. Solo quedan estadísticas anónimas. No se puede deshacer.
                        </span>
                    </span>
                </label>
            )}
            <button type="submit" className={anonimizar ? "boton-peligro self-start" : "boton self-start"} disabled={ocupado}>
                {ocupado ? "Guardando…" : anonimizar ? "Atender y borrar datos" : "Marcar como atendida"}
            </button>
        </form>
    );
}

export function SolicitudesArco() {
    const [estado, setEstado] = useState<"pendientes" | "todas">("pendientes");
    const [items, setItems] = useState<Solicitud[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<{ texto: string; tipo: "exito" | "info" } | null>(null);

    const cargar = useCallback(() => {
        api<{ items: Solicitud[] }>("GET", `/admin/arco?estado=${estado}`)
            .then((r) => {
                setItems(r.items);
                setError(null);
            })
            .catch((e) => setError(e instanceof ErrorApi ? e.message : "No se pudieron cargar las solicitudes."));
    }, [estado]);

    useEffect(() => {
        setItems(null);
        cargar();
    }, [cargar]);

    return (
        <div className="flex flex-col gap-4">
            <h1 className="titulo-pagina">Solicitudes ARCO</h1>
            <p className="text-center text-tinta-suave">
                Acceso, rectificación, cancelación, oposición y revocaciones del permiso. Se atienden en máximo {PLAZO_ARCO_DIAS_HABILES} días hábiles.
            </p>
            <div role="group" aria-label="Mostrar" className="flex gap-3">
                {(["pendientes", "todas"] as const).map((e) => (
                    <button
                        key={e}
                        type="button"
                        aria-pressed={estado === e}
                        onClick={() => setEstado(e)}
                        className={`min-h-12 rounded-full px-6 text-lg ${estado === e ? "bg-acento" : "bg-superficie hover:bg-neutro"}`}
                    >
                        {e === "pendientes" ? "Pendientes" : "Todas"}
                    </button>
                ))}
            </div>
            {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
            {error && <Aviso tipo="error">{error}</Aviso>}
            {!items && !error && <p role="status">Cargando…</p>}
            {items && items.length === 0 && <p className="tarjeta text-tinta-suave">{estado === "pendientes" ? "No hay solicitudes pendientes." : "Aún no hay solicitudes."}</p>}
            <ul className="flex flex-col gap-4">
                {items?.map((s) => (
                    <li key={s.id}>
                        <article aria-labelledby={`sol-${s.id}`} className="tarjeta">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 id={`sol-${s.id}`} className="text-2xl font-bold">{NOMBRE_TIPO_ARCO[s.tipo]} · {s.alumno.nombre}</h2>
                                {s.atendidaEn ? (
                                    <span className="rounded-full bg-exito-suave px-3 py-1 text-sm font-bold text-exito">Atendida el {fecha(s.atendidaEn)}</span>
                                ) : (
                                    <Plazo limite={s.limite} />
                                )}
                            </div>
                            <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                                <dt className="font-semibold">Recibida</dt>
                                <dd>{fecha(s.creadaEn)}</dd>
                                <dt className="font-semibold">Grupo</dt>
                                <dd>{s.grupo} · {s.docente}</dd>
                                <dt className="font-semibold">Tutor</dt>
                                <dd>{s.tutor.nombre} · {s.tutor.correo}</dd>
                                {s.detalle && (
                                    <>
                                        <dt className="font-semibold">Detalle</dt>
                                        <dd className="whitespace-pre-line">{s.detalle}</dd>
                                    </>
                                )}
                                {s.atendidaEn && (
                                    <>
                                        <dt className="font-semibold">Respuesta</dt>
                                        <dd className="whitespace-pre-line">{s.respuesta}</dd>
                                        <dt className="font-semibold">Atendió</dt>
                                        <dd>{s.atendidaPor ?? "—"}</dd>
                                    </>
                                )}
                            </dl>
                            {s.alumno.anonimizado && <p className="mt-2 text-sm text-tinta-suave">Los datos personales de este alumno ya se borraron.</p>}
                            {!s.atendidaEn && (
                                <FormularioAtencion
                                    s={s}
                                    onAtendida={(texto, tipo) => {
                                        setAviso({ texto, tipo });
                                        cargar();
                                    }}
                                />
                            )}
                        </article>
                    </li>
                ))}
            </ul>
        </div>
    );
}
