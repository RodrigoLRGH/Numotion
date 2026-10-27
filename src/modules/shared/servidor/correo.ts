// Envío de correo desacoplado del proveedor (T-03-01-09). CORREO_PROVEEDOR:
//   archivo → escribe cada correo como JSON en CORREO_DIR (desarrollo y E2E; prohibido en producción)
//   memoria → los guarda en un arreglo (pruebas)
// El proveedor real de producción está por decidir; sin él, enviar() falla en vez de perder el correo.
// Nunca se registra el contenido en logs (lleva códigos de un solo uso y datos del tutor).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Correo {
    para: string;
    asunto: string;
    texto: string;
}

export interface ProveedorCorreo {
    enviar(correo: Correo): Promise<void>;
}

export const bandejaMemoria: (Correo & { enviadoEn: Date })[] = [];

const memoria: ProveedorCorreo = {
    async enviar(c) {
        bandejaMemoria.push({ ...c, enviadoEn: new Date() });
    },
};

function archivo(dir: string): ProveedorCorreo {
    return {
        async enviar(c) {
            await mkdir(dir, { recursive: true });
            const nombre = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}.json`;
            await writeFile(path.join(dir, nombre), JSON.stringify(c, null, 2), "utf8");
        },
    };
}

const env = (clave: string): string | undefined => (import.meta.env as Record<string, string | undefined>)[clave] ?? process.env[clave];

export function proveedorCorreo(): ProveedorCorreo {
    const tipo = env("CORREO_PROVEEDOR");
    if (tipo === "memoria") return memoria;
    if (tipo === "archivo") {
        if (import.meta.env.PROD) throw new Error("CORREO_PROVEEDOR=archivo no se permite en producción");
        return archivo(env("CORREO_DIR") ?? "tmp/correos");
    }
    throw new Error("Configura CORREO_PROVEEDOR (ver .env.example)");
}
