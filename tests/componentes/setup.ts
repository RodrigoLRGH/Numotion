import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// RC-03: por defecto el dispositivo de prueba tiene cámara (enumerateDevices no la enciende) y
// getUserMedia queda pendiente: la actividad se muestra mientras se pide la cámara.
// Las pruebas que necesitan otro escenario redefinen navigator.mediaDevices.
export function simularDispositivos(dispositivos: { kind: MediaDeviceKind }[], extra: Partial<MediaDevices> = {}) {
    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
            enumerateDevices: async () => dispositivos,
            addEventListener: () => {},
            removeEventListener: () => {},
            getUserMedia: () => new Promise<MediaStream>(() => {}),
            ...extra,
        },
    });
}

beforeEach(() => simularDispositivos([{ kind: "videoinput" }]));

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
