import { hablar } from "../cliente/voz";

interface Props {
    texto: string;
    /** Nombre accesible; por defecto "Escuchar" */
    etiqueta?: string;
}

/** Botón 🔊 que lee la instrucción (es-MX). Objetivo táctil de 48 px. */
export function BotonAudio({ texto, etiqueta = "Escuchar" }: Props) {
    return (
        <button
            type="button"
            onClick={() => hablar(texto)}
            aria-label={etiqueta}
            title={etiqueta}
            className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-marca-suave text-2xl hover:bg-marca hover:text-white"
        >
            <span aria-hidden="true">🔊</span>
        </button>
    );
}
