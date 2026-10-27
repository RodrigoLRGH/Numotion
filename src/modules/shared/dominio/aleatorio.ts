// Generador pseudoaleatorio con semilla (mulberry32): permite regenerar
// exactamente el mismo diagnóstico en el servidor para calificarlo.

export type Rng = () => number;

export function crearRng(semilla: number): Rng {
    let a = semilla >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function semillaDeTexto(texto: string): number {
    let h = 2166136261;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function entero(rng: Rng, min: number, max: number): number {
    return Math.floor(rng() * (max - min + 1)) + min;
}

export function elegir<T>(rng: Rng, lista: readonly T[]): T {
    return lista[Math.floor(rng() * lista.length)];
}

export function barajar<T>(rng: Rng, lista: readonly T[]): T[] {
    const copia = [...lista];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}
