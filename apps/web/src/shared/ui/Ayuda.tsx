// Tooltip accesible: se abre con el mouse, con el teclado (foco) o al tocar en tableta; Esc lo cierra.
// El texto queda ligado al botón con aria-describedby, así el lector de pantalla también lo lee.
import { Info } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface Props {
    /** Lo que se ve, p. ej. "AP" */
    children: ReactNode;
    /** Nombre accesible del botón, p. ej. "Qué es AP" */
    etiqueta: string;
    /** Explicación que aparece en el tooltip */
    texto: ReactNode;
}

export function Ayuda({ children, etiqueta, texto }: Props) {
    const id = useId();
    const [abierto, setAbierto] = useState(false);
    return (
        <span className="relative inline-flex items-center" onMouseEnter={() => setAbierto(true)} onMouseLeave={() => setAbierto(false)}>
            <button
                type="button"
                aria-label={etiqueta}
                aria-describedby={id}
                aria-expanded={abierto}
                // En tableta el toque dispara mouseenter + focus + click: el click solo abre (no alterna)
                onClick={() => setAbierto(true)}
                onFocus={() => setAbierto(true)}
                onBlur={() => setAbierto(false)}
                onKeyDown={(e) => e.key === "Escape" && setAbierto(false)}
                className="inline-flex cursor-help items-center gap-1 rounded underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-marca"
            >
                {children}
                <Info aria-hidden="true" className="size-4 shrink-0 text-tinta-suave" />
            </button>
            <span
                id={id}
                role="tooltip"
                hidden={!abierto}
                className="absolute top-full left-0 z-20 mt-2 w-72 rounded-xl bg-tinta px-3 py-2 text-left text-sm font-normal whitespace-normal text-white shadow-lg"
            >
                {texto}
            </span>
        </span>
    );
}
