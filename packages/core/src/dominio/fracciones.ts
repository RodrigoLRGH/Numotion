// Fracciones (contenido provisional, A-30), una idea por nivel:
//   1 identificar la fracción · 2 fracciones equivalentes · 3 sumar con igual denominador
//   4 restar con igual denominador · 5 fracción de una cantidad
import { barajar, elegir, entero, type Rng } from "./aleatorio";
import type { Ejercicio, InteraccionAsignable } from "./ejercicios";

const frac = (n: number, d: number) => `${n}/${d}`;

/** Correcta + 3 distractores distintos (errores típicos primero). */
function opciones(correcta: string, candidatos: string[], rng: Rng): string[] {
    const valido = (c: string) => c !== correcta && !/^-|\/0$|^0\/0$/.test(c);
    const elegidos = barajar(rng, [...new Set(candidatos.filter(valido))]).slice(0, 3);
    // Si los errores típicos coinciden entre sí, se completa con valores cercanos a la correcta
    const [num, den] = correcta.split("/").map(Number);
    for (let k = 1; elegidos.length < 3; k++) {
        const vecinos = den ? [frac(num + k, den), frac(num - k, den)] : [String(num + k), String(num - k)];
        for (const c of vecinos) if (elegidos.length < 3 && valido(c) && !elegidos.includes(c)) elegidos.push(c);
    }
    return barajar(rng, [correcta, ...elegidos]);
}

export function generarFraccion(nivel: number, interaccion: InteraccionAsignable, rng: Rng): Ejercicio {
    const n = Math.max(1, Math.min(5, Math.round(nivel)));
    const arrastrar = interaccion === "arrastrar";
    const base = { tema: "fracciones" as const, nivel: n, interaccion, datos: {} };

    if (n === 1) {
        const d = entero(rng, 2, 8);
        const p = entero(rng, 1, d - 1);
        const objeto = elegir(rng, ["una pizza", "un pastel", "una barra de chocolate"]);
        return {
            ...base,
            enunciado: `Se partió ${objeto} en ${d} partes iguales y se comieron ${p}. ¿Qué fracción se comieron?`,
            expresion: arrastrar ? "□" : undefined,
            opciones: opciones(frac(p, d), [frac(d, p), frac(d - p, d), frac(p, d + 1), frac(p + 1, d), frac(1, d)], rng),
            respuesta: frac(p, d),
            pasos: [`El número de abajo (denominador) dice en cuántas partes iguales se partió: ${d}.`, `El de arriba (numerador) dice cuántas se tomaron: ${p}.`, `La fracción es ${frac(p, d)}.`],
        };
    }
    if (n === 2) {
        const d = entero(rng, 2, 6);
        const p = entero(rng, 1, d - 1);
        const k = entero(rng, 2, 4);
        return {
            ...base,
            enunciado: arrastrar ? "Arrastra el número que falta para que sean iguales" : "¿Qué número falta para que las fracciones sean iguales?",
            expresion: `${frac(p, d)} = □/${d * k}`,
            opciones: opciones(String(p * k), [String(p + k), String(p * k + 1), String(p * k - 1), String(d * k - p)], rng),
            respuesta: String(p * k),
            pasos: [`Fíjate en los denominadores: ${d} se convirtió en ${d * k} (se multiplicó por ${k}).`, `Lo que haces abajo, hazlo arriba: ${p} × ${k}.`, `${frac(p, d)} = ${frac(p * k, d * k)}.`],
        };
    }
    if (n === 3 || n === 4) {
        const d = entero(rng, 3, 12);
        const a = entero(rng, 1, d - 1);
        const suma = n === 3;
        const b = suma ? entero(rng, 1, d - a) : entero(rng, 1, a);
        const r = suma ? a + b : a - b;
        const signo = suma ? "+" : "−";
        return {
            ...base,
            enunciado: arrastrar ? "Arrastra el resultado al recuadro" : `¿Cuánto es ${frac(a, d)} ${signo} ${frac(b, d)}?`,
            expresion: `${frac(a, d)} ${signo} ${frac(b, d)} = □`,
            opciones: opciones(frac(r, d), [frac(r, d + d), frac(suma ? a + b : a + b, d), frac(r + 1, d), frac(Math.abs(r - 1), d), frac(r, d * 2)], rng),
            respuesta: frac(r, d),
            pasos: [
                `Los denominadores son iguales (${d}): ese número se queda igual.`,
                `${suma ? "Suma" : "Resta"} solo los numeradores: ${a} ${signo} ${b} = ${r}.`,
                `El resultado es ${frac(r, d)}.`,
            ],
        };
    }
    const d = elegir(rng, [2, 3, 4, 5, 6]);
    const total = d * entero(rng, 2, 8);
    const p = entero(rng, 1, d - 1);
    const r = (total / d) * p;
    return {
        ...base,
        enunciado: arrastrar ? "Arrastra el resultado al recuadro" : `¿Cuánto es ${frac(p, d)} de ${total}?`,
        expresion: `${frac(p, d)} de ${total} = □`,
        opciones: opciones(String(r), [String(total / d), String(total - r), String(r + p), String(total * p)], rng),
        respuesta: String(r),
        pasos: [`Divide ${total} en ${d} partes iguales: ${total} ÷ ${d} = ${total / d}.`, `Toma ${p} de esas partes: ${total / d} × ${p} = ${r}.`, `${frac(p, d)} de ${total} es ${r}.`],
    };
}
