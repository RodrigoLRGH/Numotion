import type { APIRoute } from "astro";
import { cerrarSesion } from "../../../modules/shared/servidor/auth";

export const POST: APIRoute = async ({ cookies, redirect }) => {
    await cerrarSesion(cookies);
    return redirect("/", 303);
};
