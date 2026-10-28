// Acceso del alumno sin correo (ADR-004): código de grupo + avatar + PIN de 4 íconos.
// 12 íconos posibles → 12⁴ = 20 736 combinaciones; bloqueo 5 min tras 5 fallos (en BD).
import { elegir, type Rng } from "./aleatorio";

export interface Icono {
    id: string;
    nombre: string; // se lee en voz alta (es-MX)
    emoji: string;
}

export const ICONOS_PIN: readonly Icono[] = [
    { id: "sol", nombre: "sol", emoji: "☀️" },
    { id: "luna", nombre: "luna", emoji: "🌙" },
    { id: "estrella", nombre: "estrella", emoji: "⭐" },
    { id: "corazon", nombre: "corazón", emoji: "❤️" },
    { id: "arbol", nombre: "árbol", emoji: "🌳" },
    { id: "flor", nombre: "flor", emoji: "🌻" },
    { id: "pez", nombre: "pez", emoji: "🐟" },
    { id: "casa", nombre: "casa", emoji: "🏠" },
    { id: "coche", nombre: "coche", emoji: "🚗" },
    { id: "pelota", nombre: "pelota", emoji: "⚽" },
    { id: "nube", nombre: "nube", emoji: "☁️" },
    { id: "manzana", nombre: "manzana", emoji: "🍎" },
];

export const AVATARES: readonly Icono[] = [
    { id: "gato", nombre: "gato", emoji: "🐱" },
    { id: "perro", nombre: "perro", emoji: "🐶" },
    { id: "conejo", nombre: "conejo", emoji: "🐰" },
    { id: "oso", nombre: "oso", emoji: "🐻" },
    { id: "panda", nombre: "panda", emoji: "🐼" },
    { id: "zorro", nombre: "zorro", emoji: "🦊" },
    { id: "leon", nombre: "león", emoji: "🦁" },
    { id: "tigre", nombre: "tigre", emoji: "🐯" },
    { id: "rana", nombre: "rana", emoji: "🐸" },
    { id: "mono", nombre: "mono", emoji: "🐵" },
    { id: "pinguino", nombre: "pingüino", emoji: "🐧" },
    { id: "pollito", nombre: "pollito", emoji: "🐥" },
    { id: "buho", nombre: "búho", emoji: "🦉" },
    { id: "tortuga", nombre: "tortuga", emoji: "🐢" },
    { id: "pulpo", nombre: "pulpo", emoji: "🐙" },
    { id: "ballena", nombre: "ballena", emoji: "🐳" },
    { id: "unicornio", nombre: "unicornio", emoji: "🦄" },
    { id: "dinosaurio", nombre: "dinosaurio", emoji: "🦖" },
    { id: "mariposa", nombre: "mariposa", emoji: "🦋" },
    { id: "abeja", nombre: "abeja", emoji: "🐝" },
    { id: "koala", nombre: "koala", emoji: "🐨" },
    { id: "vaca", nombre: "vaca", emoji: "🐮" },
    { id: "cerdito", nombre: "cerdito", emoji: "🐷" },
    { id: "raton", nombre: "ratón", emoji: "🐭" },
    { id: "jirafa", nombre: "jirafa", emoji: "🦒" },
    { id: "elefante", nombre: "elefante", emoji: "🐘" },
    { id: "caballo", nombre: "caballo", emoji: "🐴" },
    { id: "pajaro", nombre: "pájaro", emoji: "🐦" },
    { id: "delfin", nombre: "delfín", emoji: "🐬" },
    { id: "cangrejo", nombre: "cangrejo", emoji: "🦀" },
    { id: "caracol", nombre: "caracol", emoji: "🐌" },
    { id: "erizo", nombre: "erizo", emoji: "🦔" },
    { id: "loro", nombre: "loro", emoji: "🦜" },
    { id: "foca", nombre: "foca", emoji: "🦭" },
    { id: "ardilla", nombre: "ardilla", emoji: "🐿️" },
    { id: "lobo", nombre: "lobo", emoji: "🐺" },
    { id: "cebra", nombre: "cebra", emoji: "🦓" },
    { id: "flamenco", nombre: "flamenco", emoji: "🦩" },
    { id: "pavo_real", nombre: "pavo real", emoji: "🦚" },
    { id: "nutria", nombre: "nutria", emoji: "🦦" },
];

export const LONGITUD_PIN = 4;
const IDS_PIN = new Set(ICONOS_PIN.map((i) => i.id));
const IDS_AVATAR = new Set(AVATARES.map((a) => a.id));

export function esAvatar(valor: unknown): valor is string {
    return typeof valor === "string" && IDS_AVATAR.has(valor);
}

/** Convierte la secuencia de íconos en el texto que se hashea; null si no es válida. */
export function pinATexto(pin: unknown): string | null {
    if (!Array.isArray(pin) || pin.length !== LONGITUD_PIN) return null;
    if (!pin.every((p) => typeof p === "string" && IDS_PIN.has(p))) return null;
    return pin.join("-");
}

export function pinAleatorio(rng: Rng): string[] {
    return Array.from({ length: LONGITUD_PIN }, () => elegir(rng, ICONOS_PIN).id);
}

// Sin 0/O ni 1/I/L para que el docente lo dicte y los niños lo copien sin confusión
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generarCodigoAcceso(rng: Rng): string {
    return Array.from({ length: 6 }, () => elegir(rng, [...ALFABETO_CODIGO])).join("");
}

/** Normaliza lo que teclea el alumno ("abc 123" → "ABC123"); null si no tiene la forma de un código. */
export function normalizarCodigo(entrada: string): string | null {
    const codigo = entrada.replace(/[\s-]/g, "").toUpperCase();
    return /^[A-Z0-9]{6}$/.test(codigo) ? codigo : null;
}

/** Primer avatar del catálogo que no usa nadie en el grupo (UNIQUE(grupo_id, avatar)). */
export function avatarDisponible(usados: readonly string[]): string | null {
    const ocupados = new Set(usados);
    return AVATARES.find((a) => !ocupados.has(a.id))?.id ?? null;
}
