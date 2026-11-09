// Cola sin conexión de intentos (EXP-04.9, RI-05). Si no hay red, el intento se guarda en IndexedDB
// y se reintenta con backoff y al volver la conexión; el clienteId hace que reenviar no duplique
// (el servidor devuelve el mismo resultado). Si IndexedDB no está disponible (modo privado, sin
// permiso), se sigue en memoria: solo se pierde la persistencia entre recargas.
import { createStore, del, entries, set, type UseStore } from "idb-keyval";
import { api, ErrorApi } from "./api";

export interface CuerpoIntento {
    clienteId: string;
    asignacionId: string;
    ejercicioId: string;
    respuesta: string;
    tiempoMs: number;
    ayudaSolicitada: boolean;
}

let almacen: UseStore | null | undefined;
function store(): UseStore | null {
    if (almacen === undefined) {
        try {
            almacen = typeof indexedDB === "undefined" ? null : createStore("numotion", "intentos-pendientes");
        } catch {
            almacen = null;
        }
    }
    return almacen;
}

async function guardar(c: CuerpoIntento): Promise<void> {
    const s = store();
    if (s) await set(c.clienteId, c, s).catch(() => {});
}

async function quitar(clienteId: string): Promise<void> {
    const s = store();
    if (s) await del(clienteId, s).catch(() => {});
}

// Sin red o servidor inalcanzable (gateway); un 500 de la app no se reintenta en bucle
const sinConexion = (e: unknown) => e instanceof ErrorApi && (e.status === 0 || (e.status >= 502 && e.status <= 504));

/** Espera `ms` o hasta que el navegador avise que volvió la conexión, lo que ocurra primero. */
function esperar(ms: number): Promise<void> {
    return new Promise((resolver) => {
        const listo = () => {
            clearTimeout(t);
            window.removeEventListener("online", listo);
            resolver();
        };
        const t = setTimeout(listo, ms);
        window.addEventListener("online", listo);
    });
}

export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

/**
 * Envía el intento; si no hay conexión lo encola, llama a `alEncolar` (para mostrar "Guardando…")
 * y reintenta hasta lograrlo. Los errores de validación (4xx) se lanzan sin reintentar.
 */
export async function enviarIntento<T>(cuerpo: CuerpoIntento, alEncolar?: () => void, activo: () => boolean = () => true): Promise<T> {
    for (let intento = 0; ; intento++) {
        try {
            const r = await api<T>("POST", "/alumno/intentos", cuerpo);
            if (intento > 0) await quitar(cuerpo.clienteId);
            return r;
        } catch (e) {
            if (!sinConexion(e) || !activo()) {
                if (intento > 0) await quitar(cuerpo.clienteId);
                throw e;
            }
            if (intento === 0) {
                await guardar(cuerpo);
                alEncolar?.();
            }
            await esperar(BACKOFF_MS[Math.min(intento, BACKOFF_MS.length - 1)]);
        }
    }
}

/** Reenvía los intentos que quedaron guardados (p. ej. se recargó la página sin conexión). */
export async function sincronizarPendientes(): Promise<number> {
    const s = store();
    if (!s) return 0;
    let pendientes: [IDBValidKey, CuerpoIntento][];
    try {
        pendientes = await entries<IDBValidKey, CuerpoIntento>(s);
    } catch {
        return 0;
    }
    let enviados = 0;
    for (const [, cuerpo] of pendientes) {
        try {
            await api("POST", "/alumno/intentos", cuerpo);
            enviados++;
            await quitar(cuerpo.clienteId);
        } catch (e) {
            if (sinConexion(e)) break; // sigue sin red: se intenta en la próxima carga
            await quitar(cuerpo.clienteId); // rechazado por el servidor (cerrado, ajeno): no se reintenta
        }
    }
    return enviados;
}
