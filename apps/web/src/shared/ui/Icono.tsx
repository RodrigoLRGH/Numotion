// Iconos SVG que sustituyen a los emojis de la interfaz. Miden 1em, así que heredan el tamaño
// del texto que los rodea (text-2xl, text-5xl…) igual que lo hacía el emoji.
import camara from "../../assets/iconos/camara.svg";
import check from "../../assets/iconos/check-mark.svg";
import estrella from "../../assets/iconos/estrella.svg";
import fuego from "../../assets/iconos/fuego.svg";
import nota from "../../assets/iconos/notes-note.svg";
import trofeo from "../../assets/iconos/trofeo.svg";

const ICONOS = { camara, check, estrella, fuego, nota, trofeo };

export type NombreIcono = keyof typeof ICONOS;

/** Icono decorativo (aria-hidden): el texto de al lado o un aria-label del contenedor dan el significado. */
export function Icono({ nombre, className = "" }: { nombre: NombreIcono; className?: string }) {
    return (
        <img
            src={ICONOS[nombre]}
            alt=""
            aria-hidden="true"
            draggable={false}
            className={`inline-block size-[1em] shrink-0 align-[-0.125em] ${className}`}
        />
    );
}
