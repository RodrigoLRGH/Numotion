// T-03-01-03 · conContexto: la app se conecta como numotion_app y el contexto vive solo en la transacción.
import { afterAll, describe, expect, it } from "vitest";
import { conContexto, crearCliente } from "../../apps/api/src/infra/db";

const url = process.env.TEST_DATABASE_URL ?? "postgres://numotion_app:numotion_app@localhost:5433/numotion_test";
const app = crearCliente(url);
afterAll(() => app.$disconnect());

const DOCENTE = "00000000-0000-0000-0000-00000000d0a0";

describe("conContexto (ADR-003)", () => {
    it("fija usuario y rol solo dentro de la transacción", async () => {
        const dentro = await conContexto({ rol: "docente", id: DOCENTE }, (tx) =>
            tx.$queryRaw<{ u: string | null; r: string | null; quien: string }[]>`SELECT app_user() AS u, app_role() AS r, current_user::text AS quien`.then((r) => r[0]), app);
        expect(dentro).toEqual({ u: DOCENTE, r: "docente", quien: "numotion_app" });

        const despues = await conContexto(null, (tx) => tx.$queryRaw<{ u: string | null; r: string | null }[]>`SELECT app_user() AS u, app_role() AS r`.then((r) => r[0]), app);
        expect(despues).toEqual({ u: null, r: null });
    });

    it("revierte todo si la función falla", async () => {
        const email = `revierte-${Date.now()}@escuela.mx`;
        await expect(
            conContexto(null, async (tx) => {
                await tx.$executeRaw`SELECT fn_registrar_docente('Revierte', ${email}::citext, 'h')`;
                throw new Error("falla");
            }, app),
        ).rejects.toThrow("falla");
        const quedo = await conContexto(null, (tx) => tx.$queryRaw<unknown[]>`SELECT * FROM fn_auth_docente(${email}::citext)`, app);
        expect(quedo).toHaveLength(0);
    });
});
