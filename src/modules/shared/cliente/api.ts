// Cliente de /api/v1 para las islas React. Los errores llegan como
// { error: { code, message } } (05-contratos §0) y se lanzan como ErrorApi.

export class ErrorApi extends Error {
    constructor(
        readonly code: string,
        message: string,
        readonly status: number,
        readonly details?: unknown,
    ) {
        super(message);
    }
}

export async function api<T = unknown>(metodo: "GET" | "POST" | "PUT" | "DELETE", ruta: string, cuerpo?: unknown): Promise<T> {
    let r: Response;
    try {
        r = await fetch(`/api/v1${ruta}`, {
            method: metodo,
            headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
            credentials: "same-origin",
        });
    } catch {
        throw new ErrorApi("SIN_CONEXION", "No hay conexión. Revisa el internet e intenta otra vez.", 0);
    }
    const texto = await r.text();
    const datos = texto ? JSON.parse(texto) : null;
    if (!r.ok) {
        const e = datos?.error;
        throw new ErrorApi(e?.code ?? "INTERNO", e?.message ?? "Algo salió mal. Intenta otra vez.", r.status, e?.details);
    }
    return datos as T;
}

/** Navegación completa: el servidor vuelve a aplicar las guardas en la página destino. */
export function irA(ruta: string): void {
    window.location.assign(ruta);
}
