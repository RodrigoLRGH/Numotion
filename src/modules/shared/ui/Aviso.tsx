interface Props {
    tipo?: "error" | "info" | "exito";
    children: React.ReactNode;
}

const estilos = {
    error: "border-alerta bg-alerta-suave text-alerta",
    info: "border-marca bg-marca-suave text-marca-fuerte",
    exito: "border-exito bg-exito-suave text-exito",
};

/** Mensaje en línea anunciado por lectores de pantalla. */
export function Aviso({ tipo = "info", children }: Props) {
    return (
        <p role={tipo === "error" ? "alert" : "status"} className={`rounded-xl border-l-4 px-4 py-3 font-semibold ${estilos[tipo]}`}>
            {children}
        </p>
    );
}
