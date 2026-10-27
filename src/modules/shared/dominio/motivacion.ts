// Frase motivacional personalizada al iniciar la clase (RF-22).
import { semillaDeTexto } from "./aleatorio";
import type { BalancePanas } from "./panas";

const FRASES: Record<BalancePanas, readonly string[]> = {
    positivo: [
        "¡{nombre}, hoy tienes energía de campeón! Vamos por un nuevo reto 🚀",
        "¡Qué gusto verte tan animado, {nombre}! Tu cerebro está listo para crecer 🧠",
        "{nombre}, con esa actitud ¡nada te detiene! 🌟",
    ],
    equilibrado: [
        "¡Hola, {nombre}! Paso a paso se llega lejos 👣",
        "{nombre}, cada ejercicio te hace más fuerte en matemáticas 💪",
        "Hoy es un buen día para aprender algo nuevo, {nombre} 🌈",
    ],
    negativo: [
        "{nombre}, está bien no sentirse al cien. Vamos con calma, aquí te acompañamos 🤗",
        "Respira hondo, {nombre}. Equivocarse también es aprender 🌱",
        "{nombre}, empecemos con algo divertido y poco a poco te sentirás mejor 🎈",
    ],
};

export function fraseMotivacional(nombre: string, balance: BalancePanas | null, fecha: string): string {
    const lista = FRASES[balance ?? "equilibrado"];
    const indice = semillaDeTexto(`${nombre}|${fecha}`) % lista.length;
    const primerNombre = nombre.split(" ")[0];
    return lista[indice].replace("{nombre}", primerNombre);
}
