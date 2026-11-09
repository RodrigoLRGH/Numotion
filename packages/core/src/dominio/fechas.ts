// Las "fechas de sesión" se manejan como texto YYYY-MM-DD en la zona horaria
// de la institución, para que la racha y el diagnóstico diario no dependan del
// huso horario del servidor.

export const ZONA_HORARIA = "America/Mexico_City";

export function fechaLocal(fecha: Date = new Date(), zona: string = ZONA_HORARIA): string {
    // en-CA formatea como YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: zona,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(fecha);
}

function aUtc(fecha: string): Date {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function aTexto(fecha: Date): string {
    return fecha.toISOString().slice(0, 10);
}

export function sumarDias(fecha: string, dias: number): string {
    const d = aUtc(fecha);
    d.setUTCDate(d.getUTCDate() + dias);
    return aTexto(d);
}

export function esDiaHabil(fecha: string): boolean {
    const dia = aUtc(fecha).getUTCDay();
    return dia !== 0 && dia !== 6;
}

/** Día hábil inmediatamente anterior a `fecha` (salta sábado y domingo). */
export function diaHabilAnterior(fecha: string): string {
    let d = sumarDias(fecha, -1);
    while (!esDiaHabil(d)) d = sumarDias(d, -1);
    return d;
}

/** Último día hábil que es <= fecha (la propia fecha si es hábil). */
export function ultimoDiaHabilHasta(fecha: string): string {
    let d = fecha;
    while (!esDiaHabil(d)) d = sumarDias(d, -1);
    return d;
}
