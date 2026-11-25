// D5 · Alertas tempranas en vivo y guía de actuación (RF-16, RF-27, EXP-05.5, EXP-05.6).
// SSE con reconexión automática; si el navegador o la red no lo permiten, sondeo cada 30 s.
import { Check, CircleCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ErrorApi } from "../../../shared/cliente/api";
import { Aviso } from "../../../shared/ui/Aviso";
import { fechaHora, ICONO } from "./estados";

export interface Alerta {
    alertaId: string;
    alumno: { id: string; nombre: string; avatar: string };
    actividad: string | null;
    tema: string | null;
    indice: number;
    senales: { descripcion?: string[]; sinCamara?: boolean };
    guia: { id: string; titulo: string } | null;
    alumnoAceptoAyuda: boolean | null;
    atendidaEn: string | null;
    creadaEn: string;
}

interface GuiaActuacion {
    id: string;
    titulo: string;
    pasos: { orden: number; texto: string }[];
}

/** Alertas pendientes del docente: carga inicial + SSE (+ sondeo de respaldo). */
export function useAlertas(grupoId?: string) {
    const [items, setItems] = useState<Alerta[]>([]);
    const [nueva, setNueva] = useState<Alerta | null>(null);
    const cargar = useCallback(async () => {
        try {
            const q = new URLSearchParams({ pendientes: "true", ...(grupoId ? { grupoId } : {}) });
            setItems((await api<{ items: Alerta[] }>("GET", `/docente/alertas?${q}`)).items);
        } catch {
            // se reintenta en el siguiente sondeo
        }
    }, [grupoId]);

    useEffect(() => {
        void cargar();
        const respaldo = window.setInterval(cargar, 30_000);
        let fuente: EventSource | null = null;
        if (typeof EventSource !== "undefined") {
            fuente = new EventSource("/api/v1/docente/alertas/stream", { withCredentials: true });
            fuente.addEventListener("alerta.nueva", (ev) => {
                try {
                    const a = JSON.parse((ev as MessageEvent<string>).data) as Alerta;
                    setItems((l) => (l.some((x) => x.alertaId === a.alertaId) ? l : [a, ...l]));
                    setNueva(a);
                } catch {
                    // evento mal formado: se ignora
                }
            });
        }
        return () => {
            window.clearInterval(respaldo);
            fuente?.close();
        };
    }, [cargar]);

    const quitar = (id: string) => setItems((l) => l.filter((a) => a.alertaId !== id));
    return { items, nueva, descartarNueva: () => setNueva(null), quitar, recargar: cargar };
}

export function DetalleAlerta({ alerta, onAtendida }: { alerta: Alerta; onAtendida(): void }) {
    const [guia, setGuia] = useState<GuiaActuacion | null>(null);
    const [nota, setNota] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        if (!alerta.guia) return;
        api<GuiaActuacion>("GET", `/docente/guias/${alerta.guia.id}`).then(setGuia).catch(() => setGuia(null));
    }, [alerta.guia]);

    async function atender() {
        setEnviando(true);
        setError(null);
        try {
            await api("POST", `/docente/alertas/${alerta.alertaId}/atender`, nota.trim() ? { nota: nota.trim() } : {});
            onAtendida();
        } catch (e) {
            setError(e instanceof ErrorApi ? e.message : "No se pudo marcar como atendida.");
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-white p-4">
            <p>
                <strong>Señales:</strong> {alerta.senales.descripcion?.length ? alerta.senales.descripcion.join(" · ") : "índice de frustración alto"}
            </p>
            <p>
                <strong>¿Aceptó ayuda?</strong> {alerta.alumnoAceptoAyuda === null ? "Aún no responde" : alerta.alumnoAceptoAyuda ? "Sí" : "No, quiso intentarlo solo"}
            </p>
            {guia && (
                <section aria-label="Guía de actuación">
                    <h4 className="font-extrabold">Guía de actuación: {guia.titulo}</h4>
                    <ol className="mt-1 list-decimal pl-6">
                        {guia.pasos.map((p) => (
                            <li key={p.orden}>{p.texto}</li>
                        ))}
                    </ol>
                </section>
            )}
            <label className="etiqueta" htmlFor={`nota-${alerta.alertaId}`}>Nota rápida (opcional)</label>
            <textarea id={`nota-${alerta.alertaId}`} className="campo" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="flex flex-wrap gap-2">
                <button type="button" className="boton" onClick={atender} disabled={enviando}>
                    Marcar como atendida <Check aria-hidden="true" className={ICONO} />
                </button>
                <Link to={`/docente/alumnos/${alerta.alumno.id}`} className="boton-secundario">Ver ficha</Link>
            </div>
        </div>
    );
}

export function ListaAlertas({ alertas, onQuitar }: { alertas: Alerta[]; onQuitar(id: string): void }) {
    const [abierta, setAbierta] = useState<string | null>(null);
    if (alertas.length === 0) return <p className="flex items-center gap-1 text-tinta-suave">Sin alertas pendientes. <CircleCheck aria-hidden="true" className={`${ICONO} text-exito`} /></p>;
    return (
        <ul className="flex flex-col gap-2">
            {alertas.map((a) => (
                <li key={a.alertaId} className="rounded-xl border-l-4 border-alerta bg-alerta-suave p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <TriangleAlert aria-hidden="true" className="size-5 shrink-0 text-alerta" />
                        <p className="flex-grow">
                            <strong>{a.alumno.nombre}</strong> muestra señales de frustración
                            {a.actividad ? ` — ${a.actividad}${a.tema ? ` (${a.tema})` : ""}` : ""} · índice {a.indice.toFixed(2)} · {fechaHora(a.creadaEn)}
                        </p>
                        <button type="button" className="boton-secundario" aria-expanded={abierta === a.alertaId} onClick={() => setAbierta((x) => (x === a.alertaId ? null : a.alertaId))}>
                            {abierta === a.alertaId ? "Ocultar" : "Ver guía"}
                        </button>
                    </div>
                    {abierta === a.alertaId && <DetalleAlerta alerta={a} onAtendida={() => onQuitar(a.alertaId)} />}
                </li>
            ))}
        </ul>
    );
}

/** Aviso emergente cuando llega una alerta nueva por SSE. */
export function AvisoAlertaNueva({ alerta, onCerrar }: { alerta: Alerta | null; onCerrar(): void }) {
    const t = useRef<number | null>(null);
    useEffect(() => {
        if (!alerta) return;
        t.current = window.setTimeout(onCerrar, 12_000);
        return () => {
            if (t.current) window.clearTimeout(t.current);
        };
    }, [alerta, onCerrar]);
    if (!alerta) return null;
    return (
        <div role="alert" className="fixed right-4 bottom-4 z-50 max-w-sm rounded-2xl border-2 border-alerta bg-white p-4 shadow-lg">
            <p className="flex items-center gap-1 font-extrabold text-alerta"><TriangleAlert aria-hidden="true" className="size-5 shrink-0" />Alerta temprana</p>
            <p className="mt-1">{alerta.alumno.nombre} muestra señales de frustración{alerta.actividad ? ` en ${alerta.actividad}` : ""}.</p>
            <div className="mt-2 flex gap-2">
                <a href="#alertas" className="boton" onClick={onCerrar}>Ver guía</a>
                <button type="button" className="boton-secundario" onClick={onCerrar}>Cerrar</button>
            </div>
        </div>
    );
}
