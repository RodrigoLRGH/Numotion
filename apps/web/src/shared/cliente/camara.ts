// RC-03: el alumno usa la plataforma solo en un dispositivo con cámara (modelo uno a uno).
// enumerateDevices() dice si hay una cámara SIN encenderla ni pedir permiso; la cámara se enciende
// solo en la pantalla de actividad.

export async function hayCamara(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return false;
    try {
        const dispositivos = await navigator.mediaDevices.enumerateDevices();
        return dispositivos.some((d) => d.kind === "videoinput");
    } catch {
        return false;
    }
}
