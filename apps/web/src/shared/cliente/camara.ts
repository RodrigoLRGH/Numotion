// RC-03: el alumno usa la plataforma solo en un dispositivo con cámara (modelo uno a uno).
// enumerateDevices() dice si hay una cámara SIN encenderla ni pedir permiso: así se cumple RC-03
// aunque el tutor no haya autorizado usarla (en ese caso la cámara nunca se enciende).

export async function hayCamara(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return false;
    try {
        const dispositivos = await navigator.mediaDevices.enumerateDevices();
        return dispositivos.some((d) => d.kind === "videoinput");
    } catch {
        return false;
    }
}
