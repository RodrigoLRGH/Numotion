// Ventana modal accesible: role="dialog" con título, foco en el botón de cerrar al abrir, Esc o
// clic fuera la cierran, el foco no sale de ella con Tab y vuelve al elemento que la abrió.
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface Props {
    titulo: string;
    abierto: boolean;
    onCerrar(): void;
    children: ReactNode;
}

export function Dialogo({ titulo, abierto, onCerrar, children }: Props) {
    const idTitulo = useId();
    const caja = useRef<HTMLDivElement>(null);
    const cerrar = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!abierto) return;
        const anterior = document.activeElement as HTMLElement | null;
        cerrar.current?.focus();
        const teclas = (e: KeyboardEvent) => {
            if (e.key === "Escape") return onCerrar();
            if (e.key !== "Tab" || !caja.current) return;
            const enfocables = caja.current.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
            const primero = enfocables[0];
            const ultimo = enfocables[enfocables.length - 1];
            if (e.shiftKey && document.activeElement === primero) {
                e.preventDefault();
                ultimo?.focus();
            } else if (!e.shiftKey && document.activeElement === ultimo) {
                e.preventDefault();
                primero?.focus();
            }
        };
        document.addEventListener("keydown", teclas);
        return () => {
            document.removeEventListener("keydown", teclas);
            anterior?.focus();
        };
    }, [abierto, onCerrar]);

    if (!abierto) return null;
    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/70 p-4" onPointerDown={(e) => e.target === e.currentTarget && onCerrar()}>
            <div
                ref={caja}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                className="relative max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-[3rem] bg-superficie px-6 py-8 shadow-lg sm:px-16"
            >
                <h2 id={idTitulo} className="pr-10 text-center text-2xl font-bold">{titulo}</h2>
                <button
                    ref={cerrar}
                    type="button"
                    aria-label="Cerrar"
                    onClick={onCerrar}
                    className="absolute top-6 right-6 flex size-12 cursor-pointer items-center justify-center rounded-full hover:bg-neutro"
                >
                    <X aria-hidden="true" className="size-8" />
                </button>
                <div className="mt-6 flex flex-col gap-3 text-lg">{children}</div>
            </div>
        </div>
    );
}
