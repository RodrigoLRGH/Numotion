// Página del tutor (RC-08, RNF-10, T-03-01-10, HU-03, ADR-009): leer el aviso, verificar con un código
// enviado a su correo y autorizar la plataforma, que incluye la detección emocional con la cámara (A-41).
// Desde el mismo enlace puede retirar el permiso. Sin solicitudes ARCO (RC-07 fuera del MVP).
import { useState } from "react";
import { PARENTESCOS, type EstadoConsentimiento } from "@numotion/core/dominio/consentimiento";
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
    aviso: { version: string | null; url: string | null };
}

type Accion = "aceptar" | "revocar";

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
        <fieldset className="flex flex-col gap-2 rounded-2xl bg-white p-5">
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
                await api("POST", `/consentimiento/${token}`, {
                    otp,
                    tutorNombre: f.get("tutorNombre"),
                    parentesco: f.get("parentesco"),
                    aceptaPlataforma: f.get("plataforma") === "on",
                });
                setEstado("vigente");
                setExito(`Listo. ${vista.alumno} ya puede usar la plataforma.`);
            } else if (accion === "revocar") {
                await api("POST", `/consentimiento/${token}/revocar`, { otp });
                setEstado("revocado");
                setExito(`Retiraste el permiso. ${vista.alumno} ya no puede entrar a la plataforma.`);
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
            <header className="text-center">
                <p className="text-lg font-semibold text-tinta-suave">Consentimiento de confidencialidad</p>
                <h1 className="mt-1 text-3xl font-bold sm:text-[40px]">Permiso para {vista.alumno}</h1>
                <p className="mt-2 text-tinta-suave">
                    Grupo {vista.grupo} · {vista.docente}
                </p>
                <p className="mt-3" role="status">
                    {estado === "vigente" && <>Estado: <strong>autorizado</strong>.</>}
                    {estado === "pendiente" && <>Estado: <strong>esperando tu autorización</strong>.</>}
                    {estado === "por_renovar" && <>Estado: <strong>el aviso de privacidad cambió</strong>; necesitamos que lo aceptes de nuevo.</>}
                    {estado === "revocado" && <>Estado: <strong>permiso retirado</strong>.</>}
                    {estado === "vencido" && <>Este enlace venció. Pide uno nuevo a {vista.docente}.</>}
                </p>
            </header>

            {exito && <Aviso tipo="exito">{exito}</Aviso>}

            <section className="tarjeta sm:rounded-[52px] sm:px-16 sm:py-10" aria-labelledby="aviso">
                <h2 id="aviso" className="text-2xl font-bold">Aviso de privacidad</h2>
                <dl className="mt-4 grid gap-4">
                    <div>
                        <dt className="font-bold">¿Para qué?</dt>
                        <dd>Para que {vista.alumno} practique matemáticas y la dificultad se ajuste a su desempeño y a cómo se siente.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">¿Qué datos?</dt>
                        <dd>Nombre, grupo, respuestas y tiempos de los ejercicios, un cuestionario breve de cómo se siente cada día y el estado emocional que se deduce de la cámara durante las actividades.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">¿Y la cámara?</dt>
                        <dd>Las imágenes <strong>nunca se guardan</strong>: se analizan al momento con Amazon Rekognition y se descartan. Solo queda la emoción detectada (por ejemplo, "calma"). La cámara se usa durante las actividades con todos los alumnos.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">¿Con quién se comparte?</dt>
                        <dd>Con la maestra o maestro del grupo. Proveedores técnicos (Amazon Web Services) procesan datos sin quedárselos. Nunca se envía su nombre ni su estado emocional a servicios de inteligencia artificial.</dd>
                    </div>
                    <div>
                        <dt className="font-bold">Tus derechos</dt>
                        <dd>Puedes retirar este permiso cuando quieras desde esta misma página. Para consultar, corregir o borrar los datos, comunícate con la escuela.</dd>
                    </div>
                </dl>
                {vista.aviso.url && <p className="mt-3"><a href={vista.aviso.url} className="enlace">Leer el aviso completo</a></p>}
            </section>

            {accion === null && estado === "vigente" && (
                <section className="flex flex-wrap justify-end gap-3" aria-label="Opciones">
                    <button type="button" className="boton-secundario" onClick={() => elegir("revocar")}>Retirar el permiso</button>
                </section>
            )}

            {accion && (
                <form onSubmit={enviar} className="tarjeta flex flex-col gap-4 sm:rounded-[52px] sm:px-16 sm:py-10">
                    <h2 className="text-2xl font-bold">
                        {accion === "aceptar" ? "Tu decisión" : "Retirar el permiso"}
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
                            <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-confirmacion px-5 py-4 text-lg">
                                <input type="checkbox" name="plataforma" required defaultChecked={estado === "vigente"} className="mt-1 size-6 shrink-0 accent-marca-fuerte" />
                                <span>
                                    <strong>Autorizo que {vista.alumno} use la plataforma</strong>, incluida la cámara para detectar emociones
                                    durante las actividades (las imágenes no se guardan). Es necesario para que pueda entrar.
                                </span>
                            </label>
                        </>
                    )}

                    {accion === "revocar" && (
                        <Aviso tipo="error">
                            {vista.alumno} ya no podrá entrar a la plataforma hasta que des un permiso nuevo.
                        </Aviso>
                    )}

                    <Codigo token={token} correo={vista.correo} valor={otp} onCambio={setOtp} />
                    {error && <Aviso tipo="error">{error}</Aviso>}

                    <div className="flex flex-wrap justify-end gap-3">
                        {estado !== "pendiente" && estado !== "por_renovar" && (
                            <button type="button" className="boton-secundario min-w-48 text-xl" onClick={() => setAccion(null)}>Cancelar</button>
                        )}
                        <button type="submit" className={`${accion === "aceptar" ? "boton-aceptar" : "boton"} min-w-48`} disabled={ocupado || otp.length !== 6}>
                            {accion === "aceptar" ? "Guardar mi decisión" : "Sí, retirar el permiso"}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
