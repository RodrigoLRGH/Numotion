// Variables de entorno de la API (guía §5). Se leen al usarse para que las pruebas puedan fijarlas.

export const esProduccion = (): boolean => process.env.NODE_ENV === "production";

export function requerida(clave: string): string {
    const valor = process.env[clave];
    if (!valor) throw new Error(`Falta la variable de entorno ${clave} (ver .env.example)`);
    return valor;
}
