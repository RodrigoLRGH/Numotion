// Paginación por cursor (convenciones §5): el cursor es opaco para el cliente y codifica la
// posición del último elemento (orden + id para desempatar).

export interface Posicion {
    orden: string;
    id: string;
}

export function codificarCursor(p: Posicion): string {
    return Buffer.from(JSON.stringify([p.orden, p.id]), "utf8").toString("base64url");
}

export function decodificarCursor(cursor: string | null | undefined): Posicion | null {
    if (!cursor) return null;
    try {
        const [orden, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        return typeof orden === "string" && typeof id === "string" ? { orden, id } : null;
    } catch {
        return null;
    }
}
