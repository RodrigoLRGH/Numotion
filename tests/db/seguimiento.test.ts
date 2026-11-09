// P-API-03 (resumen previo), P-API-05 (perfil estadístico y reporte), P-API-06 (ficha, notas,
// resultados, cruce) y P-SEC-01 (aislamiento entre docentes + auditoría) de EXP-07.
import { describe, expect, it } from "vitest";
import {
    auditarVista, capturarResultado, consolidar, crearNota, cruce, ficha, notas, perfilEstadistico, reporteCsv, reporteTemas, resultados, resumenGrupo,
} from "../../apps/api/src/modules/docente/seguimiento";
import { escenarioCompleto, responderActividad } from "./escenario";
import { sql } from "./fixture";

describe("resumen previo (RF-14, RF-62)", () => {
    it("distribución de hoy, AP/AN y dominio promedio; marca 'sin datos hoy' con la fecha del último dato", async () => {
        const e = await escenarioCompleto({ alumnos: 3 });
        const [p0] = await sql`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en) VALUES (${e.sesiones[0]}, ${e.alumnos[0]}, 4, 1.4, now()) RETURNING id`;
        const [p1] = await sql`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en) VALUES (${e.sesiones[1]}, ${e.alumnos[1]}, 2, 3.4, now()) RETURNING id`;
        await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, panas_id, estado_inicial, dominio_por_tema) VALUES
            (${e.sesiones[0]}, ${e.alumnos[0]}, ${p0.id}, 'positivo', ${sql.json({ [e.temaId]: 4 })}),
            (${e.sesiones[1]}, ${e.alumnos[1]}, ${p1.id}, 'frustracion', ${sql.json({ [e.temaId]: 2 })})`;
        // El tercero tiene un dato viejo
        const [vieja] = await sql`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${e.alumnos[2]}, fn_hoy_local() - 3) RETURNING id, to_char(fecha, 'YYYY-MM-DD') AS fecha`;
        await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${vieja.id}, ${e.alumnos[2]}, 'neutral')`;

        const r = await e.comoDocente((tx) => resumenGrupo(tx, e.grupoId));
        expect(r?.grupo).toMatchObject({
            conDiagnosticoHoy: 2, total: 3,
            distribucion: { positivo: 1, neutral: 0, frustracion: 1, desinteres: 0, sinDatos: 1 },
            afectoPositivoProm: 3, afectoNegativoProm: 2.4, dominioPromPorTema: { suma: 3 },
        });
        const tercero = r!.alumnos.find((a) => a.alumnoId === e.alumnos[2])!;
        expect(tercero).toMatchObject({ sinDatosHoy: true, fechaDato: vieja.fecha, estadoInicial: "neutral" });
        // Grupo ajeno: no existe
        const otro = await escenarioCompleto();
        expect(await otro.comoDocente((tx) => resumenGrupo(tx, e.grupoId))).toBeNull();
    });
});

describe("ficha, notas y auditoría (RF-29, RF-50, RC-07)", () => {
    it("ficha con desempeño, estado reciente, serie y últimas 3 notas; abrirla queda auditado", async () => {
        const e = await escenarioCompleto();
        await sql`INSERT INTO evento_emocional (alumno_id, sesion_id, emocion, confianza, estado_derivado) VALUES
            (${e.alumnos[0]}, ${e.sesiones[0]}, 'CALM', 80, 'neutral'), (${e.alumnos[0]}, ${e.sesiones[0]}, 'SAD', 90, 'frustracion')`;
        for (const t of ["uno", "dos", "tres", "cuatro"]) await e.comoDocente((tx) => crearNota(tx, e.docenteId, e.alumnos[0], { texto: t, etiqueta: "academico" }));
        await responderActividad(e, true);
        const f = await e.comoDocente(async (tx) => {
            const r = await ficha(tx, e.alumnos[0]);
            await auditarVista(tx, e.docenteId, "ver_alumno", "alumno", e.alumnos[0], "127.0.0.1");
            return r;
        });
        expect(f?.ultimasNotas.map((n) => n.texto)).toEqual(["cuatro", "tres", "dos"]);
        expect(f?.estadoEmocionalReciente.serie.map((s) => s.estado)).toEqual(["neutral", "frustracion"]);
        expect(f?.resumenDesempeno).toMatchObject({ enCurso: 1, puntos: 10 });
        expect(f?.datos.camara).toBe(true);
        expect(await sql`SELECT accion, recurso_id FROM auditoria_acceso WHERE actor_id = ${e.docenteId} AND accion = 'ver_alumno'`).toEqual([{ accion: "ver_alumno", recurso_id: e.alumnos[0] }]);
        expect(await e.comoDocente((tx) => notas(tx, e.alumnos[0]))).toHaveLength(4);
    });

    it("otro docente no ve la ficha ni puede crear notas o resultados del alumno", async () => {
        const e = await escenarioCompleto();
        const otro = await escenarioCompleto();
        expect(await otro.comoDocente((tx) => ficha(tx, e.alumnos[0]))).toBeNull();
        expect(await otro.comoDocente((tx) => crearNota(tx, otro.docenteId, e.alumnos[0], { texto: "x" }))).toBeNull();
        expect(await otro.comoDocente((tx) => capturarResultado(tx, otro.docenteId, e.alumnos[0], { temaId: e.temaId, tipo: "tarea", titulo: "T", calificacion: 8, fecha: e.hoy }))).toBeNull();
        expect(await otro.comoDocente((tx) => perfilEstadistico(tx, e.alumnos[0]))).toBeNull();
        expect(await otro.comoDocente((tx) => cruce(tx, e.alumnos[0]))).toBeNull();
    });
});

describe("perfil estadístico, consolidado y cruce (RF-19, RF-35, RF-52)", () => {
    it("por tema: tiempo e intentos promedio, % aciertos y errores por tipo", async () => {
        const e = await escenarioCompleto({ num: 5 });
        await responderActividad(e, true);
        await responderActividad(e, false);
        await responderActividad(e, true);
        const [p] = (await e.comoDocente((tx) => perfilEstadistico(tx, e.alumnos[0]))) ?? [];
        expect(p).toMatchObject({ tema: "Suma", ejercicios: 2, porcentajeAciertos: 100, intentosPromedio: 1.5 });
        expect(Object.values(p.erroresPorTipo).reduce((s, n) => s + n, 0)).toBe(1);
        expect(p.tiempoPromedioMs).toBe(7500);
    });

    it("consolida tareas, trabajos, interrogaciones y Numotion; el cruce marca coincidencias", async () => {
        const e = await escenarioCompleto();
        for (const [tipo, cal] of [["tarea", 5], ["trabajo_clase", 4], ["interrogacion", 6]] as const) {
            await e.comoDocente((tx) => capturarResultado(tx, e.docenteId, e.alumnos[0], { temaId: e.temaId, tipo, titulo: tipo, calificacion: cal, fecha: e.hoy }));
        }
        const r = await e.comoDocente((tx) => resultados(tx, e.alumnos[0]));
        expect(r?.consolidado).toEqual([{ temaId: e.temaId, tema: "Suma", porTipo: { tarea: 5, trabajo_clase: 4, interrogacion: 6 }, promedio: 5, registros: 3 }]);
        await sql`INSERT INTO evento_emocional (alumno_id, sesion_id, asignacion_id, emocion, confianza, estado_derivado) VALUES
            (${e.alumnos[0]}, ${e.sesiones[0]}, ${e.asignacionDe(e.alumnos[0])}, 'SAD', 90, 'frustracion'),
            (${e.alumnos[0]}, ${e.sesiones[0]}, ${e.asignacionDe(e.alumnos[0])}, 'CALM', 90, 'neutral')`;
        const [c] = (await e.comoDocente((tx) => cruce(tx, e.alumnos[0]))) ?? [];
        expect(c).toMatchObject({ tema: "Suma", promedioAcademico: 5, porcentajeFrustracion: 50, coincidencia: true });
    });

    it("consolidar: cada tipo pesa igual en el promedio general", () => {
        const t = { temaId: "t", tema: "Suma" };
        expect(consolidar([{ ...t, tipo: "tarea", calificacion: 10 }, { ...t, tipo: "tarea", calificacion: 8 }, { ...t, tipo: "interrogacion", calificacion: 6 }])[0])
            .toMatchObject({ porTipo: { tarea: 9, interrogacion: 6 }, promedio: 7.5, registros: 3 });
    });
});

describe("reporte grupal (RF-18)", () => {
    it("índice de error por tema/habilidad, ordenable, y CSV seguro", async () => {
        const e = await escenarioCompleto({ alumnos: 2, num: 5 });
        await responderActividad(e, false, e.alumnos[0]);
        await responderActividad(e, true, e.alumnos[0]);
        await responderActividad(e, true, e.alumnos[1]);
        const r = await e.comoDocente((tx) => reporteTemas(tx, e.grupoId, { orden: "error" }));
        expect(r?.length).toBeGreaterThan(0);
        const total = r!.reduce((s, f) => s + f.intentos, 0);
        expect(total).toBe(3);
        expect(r![0].alumnosAfectados).toBe(1);
        const csv = reporteCsv([{ temaId: "x", tema: "=HYPERLINK(1)", subtema: "a,b", intentos: 1, indiceError: 0.5, indiceFrustracion: null, alumnosAfectados: 1 }]);
        expect(csv).toContain("'=HYPERLINK(1)");
        expect(csv).toContain('"a,b"');
        const otro = await escenarioCompleto();
        expect(await otro.comoDocente((tx) => reporteTemas(tx, e.grupoId, { orden: "error" }))).toBeNull();
    });
});
