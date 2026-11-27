// P-API-03 · Retroalimentaciones de diagnóstico (RF-61, RF-62): registros por grupo y detalle por tema,
// aislados entre docentes (RLS).
import { describe, expect, it } from "vitest";
import { detalleRetroalimentacion, retroalimentacionesDelGrupo } from "../../apps/api/src/modules/docente/retroalimentaciones";
import { escenarioCompleto } from "./escenario";
import { sql } from "./fixture";

describe("retroalimentaciones del docente", () => {
    it("lista por grupo (más reciente primero) y detalle con temas, PANAS-C y descripción", async () => {
        const e = await escenarioCompleto({ alumnos: 2 });
        const [p] = await sql`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en)
                              VALUES (${e.sesiones[0]}, ${e.alumnos[0]}, 4, 1.4, now()) RETURNING id`;
        await sql`INSERT INTO diagnostico_mat_resultado (sesion_id, alumno_id, tema_id, aciertos, total, nivel_dominio, tiempo_total_ms)
                  VALUES (${e.sesiones[0]}, ${e.alumnos[0]}, ${e.temaId}, 3, 5, 3, 150000)`;
        const [r] = await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, panas_id, estado_inicial, dominio_por_tema, observaciones)
                              VALUES (${e.sesiones[0]}, ${e.alumnos[0]}, ${p.id}, 'positivo', ${sql.json({ [e.temaId]: 3 })}, '{"Buen ritmo"}') RETURNING id`;
        // Un registro anterior del segundo alumno
        const [vieja] = await sql`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${e.alumnos[1]}, fn_hoy_local() - 3) RETURNING id`;
        await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${vieja.id}, ${e.alumnos[1]}, 'neutral')`;

        const lista = await e.comoDocente((tx) => retroalimentacionesDelGrupo(tx, e.grupoId));
        expect(lista).toHaveLength(2);
        expect(lista![0]).toMatchObject({ id: r.id, fecha: e.hoy, alumno: { id: e.alumnos[0] }, estadoInicial: "positivo" });
        expect(lista![1]).toMatchObject({ alumno: { id: e.alumnos[1] }, estadoInicial: "neutral" });

        const d = await e.comoDocente((tx) => detalleRetroalimentacion(tx, r.id));
        expect(d).toMatchObject({ fecha: e.hoy, estadoInicial: "positivo", afectoPositivo: 4, afectoNegativo: 1.4, observaciones: ["Buen ritmo"] });
        expect(d!.temas).toEqual([expect.objectContaining({ temaId: e.temaId, ejercicios: 5, aciertos: 3, errores: 2, nivelDominio: 3, tiempoMs: 150000 })]);
        expect(d!.descripcion[0]).toMatch(/^Resolvió el diagnóstico matemático en 2 min 30 s: 5 ejercicios de 1 tema/);
        expect(d!.descripcion.at(-1)).toBe("Aspectos detectados: Buen ritmo.");

        // Sin PANAS ni diagnóstico matemático: lo dice
        const sinDatos = await e.comoDocente((tx) => detalleRetroalimentacion(tx, lista![1].id));
        expect(sinDatos!.temas).toEqual([]);
        expect(sinDatos!.descripcion).toContain("No hay resultados del diagnóstico matemático de este día.");

        // Otro docente: ni el grupo ni la retroalimentación existen para él
        const otro = await escenarioCompleto();
        expect(await otro.comoDocente((tx) => retroalimentacionesDelGrupo(tx, e.grupoId))).toBeNull();
        expect(await otro.comoDocente((tx) => detalleRetroalimentacion(tx, r.id))).toBeNull();
    });
});
