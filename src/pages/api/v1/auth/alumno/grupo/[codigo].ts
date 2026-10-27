// GET /api/v1/auth/alumno/grupo/:codigo → avatares del grupo e íconos del PIN (ADR-004)
import type { APIRoute } from "astro";
import { normalizarCodigo } from "../../../../../../modules/shared/dominio/acceso";
import { grupoParaEntrar } from "../../../../../../modules/shared/servidor/auth";
import { error, json } from "../../../../../../modules/shared/servidor/http";

export const GET: APIRoute = async ({ params }) => {
    const codigo = normalizarCodigo(params.codigo ?? "");
    const grupo = codigo ? await grupoParaEntrar(codigo) : null;
    return grupo ? json(grupo) : error("NO_ENCONTRADO", "No encontramos ese código. Revísalo con tu maestro(a).", 404);
};
