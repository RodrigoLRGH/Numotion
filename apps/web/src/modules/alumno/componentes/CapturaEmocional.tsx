// Captura de la cámara durante una actividad (EXP-05.1, RI-02, RC-03, RNF-03).
// · Siempre activa en la pantalla de actividad (RC-03, RI-02), con indicador visible.
// · Un fotograma pequeño (320×240 JPEG) cada `intervaloSeg` [10] s, solo con la pestaña visible y
//   el ejercicio activo. El fotograma se envía y se descarta: nunca se guarda en el navegador.
// · Si el navegador la niega o no hay cámara, la actividad se detiene hasta resolverlo (RC-03).
// · Se apaga al salir de la pantalla.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icono } from "../../../shared/ui/Icono";

export type EstadoCamara = "apagada" | "solicitando" | "activa" | "denegada" | "sin_camara";

export interface OfertaAyuda {
    mensaje: string;
}

interface Opciones {
    /** Ejercicio en pantalla y sin cerrar */
    activa: boolean;
    asignacionId: string;
    intervaloSeg?: number;
    /** Cambiarlo vuelve a pedir la cámara (botón "Intentar de nuevo" de RC-03) */
    reintento?: number;
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

export function useCapturaEmocional({ activa, asignacionId, intervaloSeg = 10, reintento = 0, inactividadSeg, onOfrecerAyuda }: Opciones): EstadoCamara {
    const [estado, setEstado] = useState<EstadoCamara>("apagada");
    const flujo = useRef<MediaStream | null>(null);
    const video = useRef<HTMLVideoElement | null>(null);
    const activaRef = useRef(activa);
    activaRef.current = activa;
    const callbacks = useRef({ inactividadSeg, onOfrecerAyuda });
    callbacks.current = { inactividadSeg, onOfrecerAyuda };

    // Encender la cámara al entrar y apagarla al salir
    useEffect(() => {
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
    }, [reintento]);

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

const TEXTOS: Partial<Record<EstadoCamara, { icono: ReactNode; texto: string }>> = {
    activa: { icono: <Icono nombre="camara" />, texto: "Cámara activa" },
    solicitando: { icono: <Icono nombre="camara" />, texto: "Pidiendo la cámara…" },
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
            className={`relative inline-flex items-center gap-2 rounded-xl border border-tinta bg-white px-4 py-2 text-base ${estado === "activa" ? "" : "text-tinta-suave"}`}
            title={estado === "activa" ? "La cámara ayuda a saber si necesitas apoyo. No se guardan fotos." : "La actividad sigue sin cámara."}
        >
            <span aria-hidden="true" className="text-2xl">{t.icono}</span> {t.texto}
            {/* Punto verde de Figma: cámara encendida */}
            {estado === "activa" && <span aria-hidden="true" className="absolute top-1.5 left-9 size-2.5 rounded-full bg-exito-vivo" />}
        </span>
    );
}

/** RC-03: la actividad no sigue sin cámara. */
export function CamaraRequerida({ estado, onReintentar }: { estado: "denegada" | "sin_camara"; onReintentar(): void }) {
    return (
        <section role="alert" aria-labelledby="camara-requerida" className="tarjeta mx-auto max-w-xl text-center">
            <h1 id="camara-requerida" className="text-3xl font-bold">Necesitamos tu cámara</h1>
            <p className="mt-3">
                {estado === "denegada"
                    ? "El navegador no dejó usar la cámara. Pide a tu maestro(a) que la permita y toca «Intentar de nuevo»."
                    : "No encontramos la cámara. Revisa que esté conectada y destapada y toca «Intentar de nuevo»."}
            </p>
            <button type="button" className="boton mt-6 min-h-14 px-8 text-xl" onClick={onReintentar}>Intentar de nuevo</button>
        </section>
    );
}

/** "¿Quieres que te ayude?" (RF-27 lado alumno, wireframe A4). */
export function PreguntaAyuda({ oferta, onResponder }: { oferta: OfertaAyuda; onResponder(acepta: boolean): void }) {
    return (
        <section aria-labelledby="pregunta-ayuda" className="mx-auto mt-6 max-w-3xl rounded-[2rem] bg-linear-to-r from-burbuja-inicio to-burbuja-fin p-6 text-center">
            <h2 id="pregunta-ayuda" className="text-2xl font-bold">{oferta.mensaje}</h2>
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
