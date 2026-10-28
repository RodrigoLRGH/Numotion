// Validación optimista (EXP-04.8): compara el SHA-256 de la respuesta con el hashRespuesta del
// ejercicio para dar retroalimentación inmediata. El servidor siempre tiene la última palabra.
import { textoParaHash } from "../dominio/respuesta";

export async function coincideHash(ejercicioId: string, respuesta: string, hash: string): Promise<boolean | null> {
    try {
        const datos = new TextEncoder().encode(textoParaHash(ejercicioId, respuesta));
        const digest = await crypto.subtle.digest("SHA-256", datos);
        const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
        return hex === hash;
    } catch {
        return null; // sin crypto.subtle (contexto no seguro): se espera al servidor
    }
}
