// Página del tutor (T-03-01-10, HU-03, ADR-009): leer el aviso, verificar con un código enviado a su
// correo y decidir por separado plataforma (obligatoria) y cámara (opcional). Desde el mismo enlace
// puede cambiar la preferencia de cámara, retirar el permiso o pedir derechos ARCO.
import { useState } from "react";
import { PARENTESCOS, TIPOS_ARCO, type EstadoConsentimiento, type TipoArco } from "@numotion/core/dominio/consentimiento";
import { api, ErrorApi } from "../../shared/cliente/api";
import { Aviso } from "../../shared/ui/Aviso";

export interface Vista {
    alumno: string;
    grupo: string;
    docente: string;
    tutorNombre: string;
    parentesco: string | null;
    correo: string;
    estado: EstadoConsentimiento;
    aceptaCamara: boolean;
    aviso: { version: string | null; url: string | null };
}

type Accion = "aceptar" | "revocar" | "arco";

const ETIQUETA_ARCO: Record<TipoArco, string> = {
    acceso: "Acceso: saber qué datos tienen",
    rectificacion: "Rectificación: corregir un dato",
    cancelacion: "Cancelación: borrar los datos",
    oposicion: "Oposición: que no usen los datos para algún fin",
};

function mensaje(err: unknown): string {
    return err instanceof ErrorApi ? err.message : "Algo salió mal. Intenta otra vez.";
}

/** Botón para pedir el código + campo para escribirlo. */
function Codigo({ token, correo, valor, onCambio }: { token: string; correo: string; valor: string; onCambio(v: string): void }) {
    const [estado, setEstado] = useState<{ tipo: "info" | "error"; texto: string } | null>(null);
    const [ocupado, setOcupado] = useState(false);
    async function pedir() {
        setOcupado(true);
        try {
            await api("POST", `/consentimiento/${token}/otp`);
            setEstado({ tipo: "info", texto: `Enviamos un código de 6 dígitos a ${correo}. Vence en 10 minutos.` });
        } catch (err) {
            setEstado({ tipo: "error", texto: mensaje(err) });
        } finally {
            setOcupado(false);
        }
    }
    return (
        <fieldset className="flex flex-col gap-2 rounded-xl border-2 border-slate-200 p-4">
            <legend className="px-1 font-bold">Verifica que eres tú</legend>
            <button type="button" className="boton-secundario self-start" onClick={pedir} disabled={ocupado}>
                Enviar código a {correo}
            </button>
            {estado && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}
            <label htmlFor="otp" className="etiqueta">Código de 6 dígitos</label>
            <input
                id="otp"
                value={valor}
                onChange={(e) => onCambio(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="\d{6}"
                className="campo w-40 font-mono text-2xl tracking-widest"
            />
        </fieldset>
    );
}

export default function ConsentimientoTutor({ token, vista }: { token: string; vista: Vista }) {
    const [estado, setEstado] = useState(vista.estado);
    const [camara, setCamara] = useState(vista.aceptaCamara);
    const [accion, setAccion] = useState<Accion | null>(vista.estado === "pendiente" || vista.estado === "por_renovar" ? "aceptar" : null);
    const [otp, setOtp] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [exito, setExito] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);

    async function enviar(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setOcupado(true);
        setError(null);
        try {
            if (accion === "aceptar") {
                const aceptaCamara = f.get("camara") === "on";
                await api("POST", `/consentimiento/${token}`, {
                    otp,
                    tutorNombre: f.get("tutorNombre"),
                    parentesco: f.get("parentesco"),
                    aceptaPlataforma: f.get("plataforma") === "on",
                    aceptaCamara,
                });
                setEstado("vigente");
                setCamara(aceptaCamara);
                setExito(`Listo. ${vista.alumno} ya puede usar la plataforma${aceptaCamara ? " con reconocimiento facial." : " sin cámara."}`);
            } else if (accion === "revocar") {
                await api("POST", `/consentimiento/${token}/revocar`, { otp });
                setEstado("revocado");
                setExito(`Retiraste el permiso. ${vista.alumno} ya no puede entrar y sus datos se borrarán en un máximo de 20 días hábiles.`);
            } else if (accion === "arco") {
                await api("POST", `/consentimiento/${token}/arco`, { otp, tipo: f.get("tipo"), detalle: f.get("detalle") });
                setExito("Recibimos tu solicitud. La escuela la atenderá en un máximo de 20 días hábiles.");
            }
            setAccion(null);
            setOtp("");
        } catch (err) {
            setError(mensaje(err));
        } finally {
            setOcupado(false);
        }
    }

    const elegir = (a: Accion) => {
        setAccion(a);
        setExito(null);
        setError(null);
        setOtp("");
    };

    return (
        <div className="flex flex-col gap-5">
            <header className="tarjeta">
                <h1 className="text-2xl font-extrabold">Permiso para {vista.alumno}</h1>
                <p className="mt-1 text-tinta-suave">
                    Grupo {vista.grupo} · {vista.docente}
                </p>
                <p className="mt-3" role="status">
                    {estado === "vigente" && <>Estado: <strong>autorizado</strong>, {camara ? "con cámara" : "sin cámara"}.</>}
                    {estado === "pendiente" && <>Estado: <strong>esperando tu autorización</strong>.</>}
                    {estado === "por_renovar" && <>Estado: <strong>el aviso de privacidad cambió</strong>; necesitamos que lo aceptes de nuevo.</>}
                    {estado === "revocado" && <>Estado: <strong>permiso retirado</strong>.</>}
                    {estado === "vencido" && <>Este enlace venció. Pide uno nuevo a {vista.docente}.</>}
                </p>
            </header>

            {exito && <Aviso tipo="exito">{exito}</Aviso>}

            <section className="tarjeta" aria-labelledby="aviso">
                <h2 id="aviso" className="text-xl font-extrabold">Aviso de privacidad</h2>
                <dl className="mt-3 grid gap-3">
                    <div>
                        <dt className="font-bold">¿Para qué?</dt>
                        <dd>Para que {vista.alumno} practique matemáticas y la dificultad se ajuste a su desempeño y a cómo se siente.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">¿Qué datos?</dt>
                        <dd>Nombre, grupo, respuestas y tiempos de los ejercicios, un cuestionario breve de cómo se siente cada día y, solo si lo autorizas, el estado emocional que se deduce de la cámara.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">¿Y la cámara?</dt>
                        <dd>Las imágenes <strong>nunca se guardan</strong>: se analizan al momento con Amazon Rekognition y se descartan. Solo queda la emoción detectada (por ejemplo, "calma"). Es opcional: sin cámara la plataforma funciona igual.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">¿Con quién se comparte?</dt>
                        <dd>Con la maestra o maestro del grupo. Proveedores técnicos (Amazon Web Services) procesan datos sin quedárselos. Nunca se envía su nombre ni su estado emocional a servicios de inteligencia artificial.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">Tus derechos</dt>
                        <dd>Puedes pedir acceso, corrección, borrado u oposición (derechos ARCO), y retirar este permiso cuando quieras desde esta misma página.</dd>
                    </div>
                </dl>
                {vista.aviso.url && <p className="mt-3"><a href={vista.aviso.url} className="font-bold text-marca underline">Leer el aviso completo</a></p>}
            </section>

            {accion === null && (estado === "vigente" || estado === "revocado" || estado === "vencido") && (
                <section className="tarjeta flex flex-wrap gap-3" aria-label="Opciones">
                    {estado === "vigente" && (
                        <>
                            <button type="button" className="boton-secundario" onClick={() => elegir("aceptar")}>Cambiar permiso de cámara</button>
                            <button type="button" className="boton-secundario" onClick={() => elegir("revocar")}>Retirar el permiso</button>
                        </>
                    )}
                    <button type="button" className="boton-secundario" onClick={() => elegir("arco")}>Solicitar derechos ARCO</button>
                </section>
            )}

            {accion && (
                <form onSubmit={enviar} className="tarjeta flex flex-col gap-4">
                    <h2 className="text-xl font-extrabold">
                        {accion === "aceptar" ? "Tu decisión" : accion === "revocar" ? "Retirar el permiso" : "Solicitud ARCO"}
                    </h2>

                    {accion === "aceptar" && (
                        <>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="tutorNombre" className="etiqueta">Tu nombre completo</label>
                                    <input id="tutorNombre" name="tutorNombre" required minLength={3} maxLength={120} defaultValue={vista.tutorNombre} autoComplete="name" className="campo" />
                                </div>
                                <div>
                                    <label htmlFor="parentesco" className="etiqueta">Parentesco</label>
                                    <select id="parentesco" name="parentesco" required defaultValue={vista.parentesco ?? ""} className="campo">
                                        <option value="" disabled>Elige…</option>
                                        {PARENTESCOS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                                    </select>
                                </div>
                            </div>
                            <label className="flex items-start gap-3 rounded-xl border-2 border-slate-200 p-3">
                                <input type="checkbox" name="plataforma" required defaultChecked={estado === "vigente"} className="mt-1 size-5" />
                                <span><strong>Autorizo que {vista.alumno} use la plataforma</strong> (obligatorio para que pueda entrar).</span>
                            </label>
                            <label className="flex items-start gap-3 rounded-xl border-2 border-slate-200 p-3">
                                <input type="checkbox" name="camara" defaultChecked={camara} className="mt-1 size-5" />
                                <span><strong>Autorizo la cámara</strong> para detectar emociones durante las actividades (opcional; las imágenes no se guardan).</span>
                            </label>
                        </>
                    )}

                    {accion === "revocar" && (
                        <Aviso tipo="error">
                            {vista.alumno} ya no podrá entrar y se borrarán sus datos personales en un máximo de 20 días hábiles.
                        </Aviso>
                    )}

                    {accion === "arco" && (
                        <>
                            <div>
                                <label htmlFor="tipo" className="etiqueta">¿Qué solicitas?</label>
                                <select id="tipo" name="tipo" required className="campo">
                                    {TIPOS_ARCO.map((t) => <option key={t} value={t}>{ETIQUETA_ARCO[t]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="detalle" className="etiqueta">Detalle (opcional)</label>
                                <textarea id="detalle" name="detalle" maxLength={1000} rows={3} className="campo" />
                            </div>
                        </>
                    )}

                    <Codigo token={token} correo={vista.correo} valor={otp} onCambio={setOtp} />
                    {error && <Aviso tipo="error">{error}</Aviso>}

                    <div className="flex flex-wrap gap-3">
                        <button type="submit" className="boton" disabled={ocupado || otp.length !== 6}>
                            {accion === "aceptar" ? "Guardar mi decisión" : accion === "revocar" ? "Sí, retirar el permiso" : "Enviar solicitud"}
                        </button>
                        {estado !== "pendiente" && estado !== "por_renovar" && (
                            <button type="button" className="boton-secundario" onClick={() => setAccion(null)}>Cancelar</button>
                        )}
                    </div>
                </form>
            )}
        </div>
    );
}
