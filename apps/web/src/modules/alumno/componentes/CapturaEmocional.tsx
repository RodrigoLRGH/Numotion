// Captura de la cámara durante una actividad (EXP-05.1, RI-02, RC-03, RNF-03).
// · Solo si el tutor autorizó la cámara y solo en la pantalla de actividad, con indicador visible.
// · Un fotograma pequeño (320×240 JPEG) cada `intervaloSeg` [10] s, solo con la pestaña visible y
//   el ejercicio activo. El fotograma se envía y se descarta: nunca se guarda en el navegador.
// · Si el permiso se niega o no hay cámara, la actividad sigue sin cámara.
// · Se apaga al salir de la pantalla.
import { useEffect, useRef, useState } from "react";

export type EstadoCamara = "apagada" | "solicitando" | "activa" | "denegada" | "sin_camara" | "sin_permiso";

export interface OfertaAyuda {
    alertaId: string;
    mensaje: string;
}

interface Opciones {
    /** Consentimiento de cámara del tutor (de la sesión) */
    permitida: boolean;
    /** Ejercicio en pantalla y sin cerrar */
    activa: boolean;
    asignacionId: string;
    intervaloSeg?: number;
    /** Segundos desde la última interacción del alumno (para el IF) */
    inactividadSeg(): number;
    onOfrecerAyuda(o: OfertaAyuda): void;
}

const ANCHO = 320;
const ALTO = 240;

async function enviarFotograma(blob: Blob, asignacionId: string, inactividadSeg: number): Promise<OfertaAyuda | null> {
    try {
        const q = new URLSearchParams({ asignacionId, inactividadSeg: String(Math.round(inactividadSeg)) });
        const r = await fetch(`/api/v1/alumno/emociones/frame?${q}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob, credentials: "same-origin" });
        if (!r.ok) return null;
        const datos = (await r.json()) as { ofrecerAyuda?: OfertaAyuda | null };
        return datos.ofrecerAyuda ?? null;
    } catch {
        return null; // sin conexión: la muestra simplemente se pierde
    }
}

export function useCapturaEmocional({ permitida, activa, asignacionId, intervaloSeg = 10, inactividadSeg, onOfrecerAyuda }: Opciones): EstadoCamara {
    const [estado, setEstado] = useState<EstadoCamara>(permitida ? "apagada" : "sin_permiso");
    const flujo = useRef<MediaStream | null>(null);
    const video = useRef<HTMLVideoElement | null>(null);
    const activaRef = useRef(activa);
    activaRef.current = activa;
    const callbacks = useRef({ inactividadSeg, onOfrecerAyuda });
    callbacks.current = { inactividadSeg, onOfrecerAyuda };

    // Encender la cámara al entrar y apagarla al salir
    useEffect(() => {
        if (!permitida) return setEstado("sin_permiso");
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return setEstado("sin_camara");
        let cancelado = false;
        setEstado("solicitando");
        navigator.mediaDevices
            .getUserMedia({ video: { width: ANCHO, height: ALTO, facingMode: "user" }, audio: false })
            .then((s) => {
                if (cancelado) return s.getTracks().forEach((t) => t.stop());
                flujo.current = s;
                const v = document.createElement("video");
                v.muted = true;
                v.playsInline = true;
                v.srcObject = s;
                void v.play().catch(() => {});
                video.current = v;
                setEstado("activa");
            })
            .catch((e: unknown) => {
                if (cancelado) return;
                const nombre = e instanceof DOMException ? e.name : "";
                setEstado(nombre === "NotFoundError" || nombre === "OverconstrainedError" ? "sin_camara" : "denegada");
            });
        return () => {
            cancelado = true;
            flujo.current?.getTracks().forEach((t) => t.stop());
            flujo.current = null;
            if (video.current) video.current.srcObject = null;
            video.current = null;
        };
    }, [permitida]);

    // Muestreo
    useEffect(() => {
        if (estado !== "activa") return;
        const lienzo = document.createElement("canvas");
        lienzo.width = ANCHO;
        lienzo.height = ALTO;
        let enviando = false;
        const id = window.setInterval(() => {
            const v = video.current;
            if (enviando || !v || !activaRef.current || document.visibilityState !== "visible" || v.readyState < 2) return;
            const ctx = lienzo.getContext("2d");
            if (!ctx) return;
            ctx.drawImage(v, 0, 0, ANCHO, ALTO);
            enviando = true;
            lienzo.toBlob(
                async (blob) => {
                    ctx.clearRect(0, 0, ANCHO, ALTO); // no queda nada del fotograma en el lienzo
                    if (blob) {
                        const oferta = await enviarFotograma(blob, asignacionId, callbacks.current.inactividadSeg());
                        if (oferta) callbacks.current.onOfrecerAyuda(oferta);
                    }
                    enviando = false;
                },
                "image/jpeg",
                0.7,
            );
        }, intervaloSeg * 1000);
        return () => window.clearInterval(id);
    }, [estado, asignacionId, intervaloSeg]);

    return estado;
}

const TEXTOS: Partial<Record<EstadoCamara, { icono: string; texto: string }>> = {
    activa: { icono: "📷", texto: "Cámara activa" },
    solicitando: { icono: "📷", texto: "Pidiendo la cámara…" },
    denegada: { icono: "🚫", texto: "Sin cámara" },
    sin_camara: { icono: "🚫", texto: "Sin cámara" },
};

/** Indicador visible mientras la cámara está encendida (EXP-05.1). */
export function IndicadorCamara({ estado }: { estado: EstadoCamara }) {
    const t = TEXTOS[estado];
    if (!t) return null;
    return (
        <span
            role="status"
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-base font-bold ${estado === "activa" ? "bg-alerta-suave text-alerta" : "bg-slate-100 text-tinta-suave"}`}
            title={estado === "activa" ? "La cámara ayuda a saber si necesitas apoyo. No se guardan fotos." : "La actividad sigue sin cámara."}
        >
            <span aria-hidden="true">{t.icono}</span> {t.texto}
        </span>
    );
}

/** "¿Quieres que te ayude?" (RF-27 lado alumno, wireframe A4). */
export function PreguntaAyuda({ oferta, onResponder }: { oferta: OfertaAyuda; onResponder(acepta: boolean): void }) {
    return (
        <section aria-labelledby="pregunta-ayuda" className="mt-4 rounded-2xl border-2 border-acento bg-acento-suave p-4 text-center">
            <h2 id="pregunta-ayuda" className="text-2xl font-extrabold">{oferta.mensaje}</h2>
            <div className="mt-3 flex flex-wrap justify-center gap-3">
                <button type="button" className="boton min-h-14 px-6 text-xl" onClick={() => onResponder(true)}>
                    Sí <span aria-hidden="true">👍</span>
                </button>
                <button type="button" className="boton-secundario min-h-14 px-6 text-xl" onClick={() => onResponder(false)}>
                    No, yo puedo <span aria-hidden="true">💪</span>
                </button>
            </div>
        </section>
    );
}
