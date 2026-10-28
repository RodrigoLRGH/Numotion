// Tipos de ejercicio (enum tipo_interaccion) y cuáles admite cada tema (A-25).
// El motor de ejercicios (EXP-04) debe poder servir cada combinación listada aquí.

export const TIPOS_INTERACCION = [
    { id: "seleccion_multiple", nombre: "Selección múltiple", icono: "🔘" },
    { id: "arrastrar", nombre: "Arrastrar y soltar", icono: "✋" },
    { id: "completar_operacion", nombre: "Completar la operación", icono: "🧩" },
    { id: "identificar_numero", nombre: "Encuentra el número", icono: "🔎" },
    { id: "numero_a_palabras", nombre: "Escribe el número con letras", icono: "✍️" },
    { id: "suma_figuras", nombre: "Suma con figuras", icono: "🍎" },
    { id: "colorear_figura", nombre: "Colorea la figura", icono: "🎨" },
] as const;

export type TipoInteraccionActividad = (typeof TIPOS_INTERACCION)[number]["id"];

const OPERACION: TipoInteraccionActividad[] = ["seleccion_multiple", "arrastrar", "completar_operacion"];

export const TIPOS_POR_TEMA: Record<string, readonly TipoInteraccionActividad[]> = {
    numeros: ["identificar_numero", "numero_a_palabras", "seleccion_multiple"], // RF-39, RF-40
    suma: [...OPERACION, "suma_figuras"], // RF-41, RF-42
    resta: OPERACION,
    multiplicacion: OPERACION,
    division: OPERACION,
    geometria: ["colorear_figura", "seleccion_multiple"], // RF-44
    fracciones: ["seleccion_multiple", "arrastrar"],
};

export function tiposDeTema(clave: string): readonly TipoInteraccionActividad[] {
    return TIPOS_POR_TEMA[clave] ?? [];
}

export function nombreTipo(id: string): string {
    return TIPOS_INTERACCION.find((t) => t.id === id)?.nombre ?? id;
}
