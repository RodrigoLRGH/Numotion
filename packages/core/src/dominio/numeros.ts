// Escritura de números en palabras (RF-39, RF-40) con tolerancia ortográfica.

const UNIDADES = [
    "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve",
    "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

function menorQueMil(n: number): string {
    if (n === 100) return "cien";
    const c = Math.floor(n / 100);
    const resto = n % 100;
    const partes: string[] = [];
    if (c > 0) partes.push(CENTENAS[c]);
    if (resto > 0) {
        if (resto < 30) partes.push(UNIDADES[resto]);
        else {
            const d = Math.floor(resto / 10);
            const u = resto % 10;
            partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`);
        }
    }
    return partes.join(" ");
}

/** Convierte 0..999 999 a palabras en español. */
export function numeroAPalabras(n: number): string {
    if (!Number.isInteger(n) || n < 0 || n > 999_999) throw new RangeError("Fuera de rango");
    if (n < 1000) return n === 0 ? "cero" : menorQueMil(n);
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const textoMiles = miles === 1 ? "mil" : `${menorQueMil(miles).replace(/veintiuno$/, "veintiún").replace(/uno$/, "un")} mil`;
    return resto === 0 ? textoMiles : `${textoMiles} ${menorQueMil(resto)}`;
}

export function normalizarTexto(t: string): string {
    return t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zñ ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function distanciaEdicion(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array<number>(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const costo = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + costo);
        }
    }
    return dp[m][n];
}

/**
 * Compara la escritura del alumno con la esperada ignorando acentos,
 * mayúsculas y espacios extra; tolera 1 error menor por cada 8 letras.
 */
export function coincideTolerante(respuesta: string, esperada: string): { correcta: boolean; exacta: boolean } {
    const r = normalizarTexto(respuesta);
    const e = normalizarTexto(esperada);
    if (r === e) return { correcta: true, exacta: true };
    const sinEspaciosR = r.replace(/ /g, "");
    const sinEspaciosE = e.replace(/ /g, "");
    const tolerancia = Math.max(1, Math.floor(sinEspaciosE.length / 8));
    const d = distanciaEdicion(sinEspaciosR, sinEspaciosE);
    return { correcta: d <= tolerancia, exacta: false };
}

// ───────────── Serie de números con letras (RF-39) ─────────────
// La actividad muestra varios números, cada uno con su campo. La respuesta (esperada y del alumno)
// viaja como arreglo JSON de textos en el mismo orden; los ejercicios antiguos de un solo número
// guardan el texto plano y se siguen calificando igual.

/** Lee una serie (arreglo JSON de textos); null si el valor no es una serie. */
export function leerSerie(valor: string): string[] | null {
    if (!valor.trimStart().startsWith("[")) return null;
    try {
        const v: unknown = JSON.parse(valor);
        return Array.isArray(v) && v.every((x) => typeof x === "string") ? v : null;
    } catch {
        return null;
    }
}

/** Un error "de ortografía" está a pocas letras de la escritura correcta; si no, es de lectura del número. */
const DISTANCIA_ORTOGRAFIA = 3;

export interface EvaluacionEscritura {
    correcta: boolean;
    /** Acierto por número de la serie (un solo elemento en los ejercicios antiguos) */
    items: boolean[];
    /** Todos los fallos están a ≤ 3 letras de la escritura correcta */
    soloOrtografia: boolean;
}

/** Califica la escritura con tolerancia (A-07) número por número. */
export function evaluarEscritura(respuesta: string, esperada: string): EvaluacionEscritura {
    const esperadas = leerSerie(esperada) ?? [esperada];
    const serie = leerSerie(esperada) !== null;
    const dadas = serie ? (leerSerie(respuesta) ?? []) : [respuesta];
    const items = esperadas.map((e, i) => coincideTolerante(dadas[i] ?? "", e).correcta);
    const soloOrtografia = esperadas.every((e, i) => {
        if (items[i]) return true;
        const d = distanciaEdicion(normalizarTexto(dadas[i] ?? "").replace(/ /g, ""), normalizarTexto(e).replace(/ /g, ""));
        return (dadas[i] ?? "").trim() !== "" && d <= DISTANCIA_ORTOGRAFIA;
    });
    return { correcta: items.every(Boolean), items, soloOrtografia };
}

/** Texto para mostrar la respuesta correcta en la guía (la serie como lista). */
export function escrituraLegible(esperada: string): string {
    const serie = leerSerie(esperada);
    return serie ? serie.join(" · ") : esperada;
}
