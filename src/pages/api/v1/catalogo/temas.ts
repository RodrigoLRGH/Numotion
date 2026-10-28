// GET /api/v1/catalogo/temas → temas con los tipos de ejercicio que admite cada uno (05-contratos §4.7, A-25).
// Solo se listan las combinaciones que el motor ya sirve; los temas sin ninguna quedan con lista vacía.
import type { APIRoute } from "astro";
import { tiposDeTema } from "../../../../modules/shared/dominio/catalogo";
import { combinacionDisponible } from "../../../../modules/shared/dominio/contenido";
import { conContexto } from "../../../../modules/shared/servidor/db";
import { json } from "../../../../modules/shared/servidor/http";

export const GET: APIRoute = async () => {
    const temas = await conContexto(null, (tx) => tx`SELECT id, clave, nombre, grado_min AS "gradoMin", grado_max AS "gradoMax" FROM tema ORDER BY orden`);
    return json({ items: temas.map((t) => ({ ...t, tiposInteraccion: tiposDeTema(t.clave).filter((tipo) => combinacionDisponible(t.clave, tipo)) })) });
};
