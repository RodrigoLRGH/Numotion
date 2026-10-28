// Tipos de scripts/migrar.mjs para las pruebas (tests/db/setup-global.ts).
export function migrar(url: string, opciones?: { seed?: boolean; passwordApp?: string | null }): Promise<string[]>;
