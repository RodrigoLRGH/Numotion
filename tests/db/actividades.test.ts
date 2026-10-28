// P-API-01 (crear actividad, nivel inicial, destino excluyente, ajenos), P-API-04 (seguimiento e historial)
// y P-SEC-01 (aislamiento entre docentes) sobre los servicios del módulo docente.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { registrarDocente } from "../../src/modules/shared/servidor/auth";
import { conContexto, type Contexto } from "../../src/modules/shared/servidor/db";
import { crearAlumno, crearGrupo } from "../../src/modules/docente/servidor/grupos";
import { actividadesAsignadas, crearActividad, historial, previsualizarNiveles, type DatosActividad } from "../../src/modules/docente/servidor/actividades";
import { sql } from "./fixture";

const tema = async (clave: string): Promise<string> => (await sql`SELECT id FROM tema WHERE clave = ${clave}`)[0].id;

async function docenteConAlumnos(nombres = ["Ana", "Beto", "Caro"]) {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad') ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente Act", `act-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctx: Contexto = { rol: "docente", id: docente.id };
    const grupo = await conContexto(ctx, (tx) => crearGrupo(tx, docente.id, { nombre: "3A", grado: 3, cicloEscolar: "2026-2027" }));
    const alumnos: string[] = [];
    for (const nombre of nombres) {
        const r = await conContexto(ctx, (tx) => crearAlumno(tx, grupo.id, { nombre, apellidos: "", tutorNombre: "Tutor", tutorEmail: "t@correo.mx" }));
        if (!r.ok) throw new Error(r.message);
        alumnos.push(r.alumno.id);
    }
    const como = <T>(fn: Parameters<typeof conContexto<T>>[1]) => conContexto(ctx, fn);
    return { docenteId: docente.id, grupo, alumnos, como };
}

/** Diagnóstico de hoy con dominio y estado inicial (como owner: simula EXP-02 ya hecho). */
async function diagnostico(alumnoId: string, temaId: string, dominio: number, estado: string) {
    const [s] = await sql`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${alumnoId}, fn_hoy_local() - 1)
                          ON CONFLICT (alumno_id, fecha) DO UPDATE SET ultima_actividad_en = now() RETURNING id`;
    await sql`INSERT INTO diagnostico_mat_resultado (sesion_id, alumno_id, tema_id, aciertos, total, nivel_dominio, tiempo_total_ms)
              VALUES (${s.id}, ${alumnoId}, ${temaId}, 3, 3, ${dominio}, 1000) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${s.id}, ${alumnoId}, ${estado})
              ON CONFLICT (sesion_id) DO UPDATE SET estado_inicial = EXCLUDED.estado_inicial`;
}

/** Completa una asignación con `correctos` de `total` ejercicios (como el alumno, vía el trigger). */
async function completar(asignacionId: string, alumnoId: string, temaId: string, total: number, correctos: number) {
    for (let i = 0; i < total; i++) {
        const [e] = await sql`INSERT INTO ejercicio (tema_id, tipo_interaccion, nivel, enunciado, respuesta, pasos_solucion, origen)
            VALUES (${temaId}, 'seleccion_multiple', 2, '{}', '{}', '[{"orden":1,"texto":"a"},{"orden":2,"texto":"b"}]', 'generador') RETURNING id`;
        const ok = i < correctos;
        await conContexto({ rol: "alumno", id: alumnoId }, (tx) => tx`
            INSERT INTO intento_ejercicio (asignacion_id, alumno_id, ejercicio_id, nivel, respuesta, correcta, numero_intento, tiempo_ms, cliente_id)
            VALUES (${asignacionId}, ${alumnoId}, ${e.id}, 2, '{}', ${ok}, ${ok ? 1 : 4}, 5000, gen_random_uuid())`);
    }
}

const base = (temaId: string, destino: DatosActividad["destino"], nombre = "Sumas 1"): DatosActividad => ({
    nombre, temaId, tipoInteraccion: "seleccion_multiple", fechaAsignacion: "2026-10-27", numEjercicios: 3, destino,
});

describe("crear actividad (P-API-01)", () => {
    it("al grupo: una asignación por alumno activo con nivel inicial según su diagnóstico", async () => {
        const d = await docenteConAlumnos();
        const suma = await tema("suma");
        await diagnostico(d.alumnos[0], suma, 4, "positivo");
        await diagnostico(d.alumnos[1], suma, 4, "frustracion");

        const previa = await d.como((tx) => previsualizarNiveles(tx, suma, { tipo: "grupo", grupoId: d.grupo.id }));
        expect(previa?.map((p) => [p.nombre, p.nivelInicial, p.sinDiagnostico, p.estadoInicial])).toEqual([
            ["Ana", 4, false, "positivo"],
            ["Beto", 3, false, "frustracion"],
            ["Caro", 2, true, null],
        ]);

        const r = await d.como((tx) => crearActividad(tx, d.docenteId, base(suma, { tipo: "grupo", grupoId: d.grupo.id })));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const porAlumno = Object.fromEntries(r.asignaciones.map((a) => [a.alumnoId, [a.nivelInicial, a.sinDiagnostico]]));
        expect(porAlumno).toEqual({ [d.alumnos[0]]: [4, false], [d.alumnos[1]]: [3, false], [d.alumnos[2]]: [2, true] });
    });

    it("a alumnos específicos; ignora repetidos", async () => {
        const d = await docenteConAlumnos();
        const resta = await tema("resta");
        const r = await d.como((tx) => crearActividad(tx, d.docenteId, base(resta, { tipo: "alumnos", alumnoIds: [d.alumnos[2], d.alumnos[2]] })));
        expect(r.ok && r.asignaciones.map((a) => a.alumnoId)).toEqual([d.alumnos[2]]);
    });

    it("rechaza tipos que el tema no admite y destinos vacíos", async () => {
        const d = await docenteConAlumnos();
        const resta = await tema("resta");
        expect(await d.como((tx) => crearActividad(tx, d.docenteId, { ...base(resta, { tipo: "grupo", grupoId: d.grupo.id }), tipoInteraccion: "colorear_figura" })))
            .toMatchObject({ ok: false, status: 422 });
        await expect(d.como((tx) => crearActividad(tx, d.docenteId, base(resta, { tipo: "alumnos", alumnoIds: [] }))))
            .rejects.toThrow("ASIGNACION_DESTINO_INVALIDO");
    });

    it("no asigna ni previsualiza alumnos o grupos de otro docente (P-SEC-01)", async () => {
        const a = await docenteConAlumnos();
        const b = await docenteConAlumnos(["Intruso"]);
        const suma = await tema("suma");
        await expect(a.como((tx) => crearActividad(tx, a.docenteId, base(suma, { tipo: "grupo", grupoId: b.grupo.id })))).rejects.toThrow("GRUPO_NO_PERMITIDO");
        await expect(a.como((tx) => crearActividad(tx, a.docenteId, base(suma, { tipo: "alumnos", alumnoIds: [a.alumnos[0], b.alumnos[0]] })))).rejects.toThrow("ALUMNO_NO_PERMITIDO");
        expect(await a.como((tx) => previsualizarNiveles(tx, suma, { tipo: "grupo", grupoId: b.grupo.id }))).toBeNull();
        expect(await a.como((tx) => previsualizarNiveles(tx, suma, { tipo: "alumnos", alumnoIds: [b.alumnos[0]] }))).toBeNull();
    });
});

describe("seguimiento e historial (P-API-04)", () => {
    it("resume por estado, oculta las terminadas en 'activas' y pagina por cursor", async () => {
        const d = await docenteConAlumnos(["Ana", "Beto"]);
        const suma = await tema("suma");
        const ids: string[] = [];
        for (const [i, fecha] of ["2026-10-20", "2026-10-21", "2026-10-22"].entries()) {
            const r = await d.como((tx) => crearActividad(tx, d.docenteId, { ...base(suma, { tipo: "grupo", grupoId: d.grupo.id }, `Act ${i + 1}`), fechaAsignacion: fecha }));
            if (r.ok) ids.push(r.actividadId);
        }
        // Act 3: Ana completa; Beto la empieza. Act 1: ambos completan
        const asig = async (act: string, alumno: string) => (await sql`SELECT id FROM asignacion_alumno WHERE actividad_id = ${act} AND alumno_id = ${alumno}`)[0].id;
        await completar(await asig(ids[2], d.alumnos[0]), d.alumnos[0], suma, 3, 3);
        await completar(await asig(ids[2], d.alumnos[1]), d.alumnos[1], suma, 1, 1);
        for (const al of d.alumnos) await completar(await asig(ids[0], al), al, suma, 3, 2);

        const todas = await d.como((tx) => actividadesAsignadas(tx, { estado: "todas", limite: 2 }));
        expect(todas.items.map((a) => a.nombre)).toEqual(["Act 3", "Act 2"]);
        expect(todas.items[0].resumen).toEqual({ pendiente: 0, enCurso: 1, completada: 1 });
        expect(todas.items[0].alumnos.map((a) => [a.nombre, a.estado, a.resueltos])).toEqual([["Ana", "completada", 3], ["Beto", "en_curso", 1]]);
        expect(todas.nextCursor).not.toBeNull();
        const siguiente = await d.como((tx) => actividadesAsignadas(tx, { estado: "todas", limite: 2, cursor: todas.nextCursor }));
        expect(siguiente.items.map((a) => a.nombre)).toEqual(["Act 1"]);
        expect(siguiente.nextCursor).toBeNull();

        const activas = await d.como((tx) => actividadesAsignadas(tx, { estado: "activas" }));
        expect(activas.items.map((a) => a.nombre)).toEqual(["Act 3", "Act 2"]);

        // Historial: solo completadas, más reciente primero, con resultado 0–10
        await sql`UPDATE asignacion_alumno SET completada_en = '2026-09-15 10:00-07' WHERE actividad_id = ${ids[0]}`;
        const h = await d.como((tx) => historial(tx, {}));
        expect(h.items).toHaveLength(3);
        expect([h.items[0].actividad, h.items[0].alumno, h.items[0].resultadoFinal]).toEqual(["Act 3", "Ana", "10.00"]);
        // Act 1 se completó a la misma hora para ambos: el desempate es por id
        expect(h.items.slice(1).map((e) => [e.actividad, e.resultadoFinal])).toEqual([["Act 1", "6.67"], ["Act 1", "6.67"]]);
        expect(h.items.slice(1).map((e) => e.alumno).sort()).toEqual(["Ana", "Beto"]);
        expect(h.items[0]).toMatchObject({ actividad: "Act 3", tiempoTotalMs: 15000, nivelInicial: 2 });

        const septiembre = await d.como((tx) => historial(tx, { desde: "2026-09-01", hasta: "2026-09-30" }));
        expect(septiembre.items.map((e) => e.actividad)).toEqual(["Act 1", "Act 1"]);
        const deAna = await d.como((tx) => historial(tx, { alumnoId: d.alumnos[0] }));
        expect(deAna.items.map((e) => e.actividad)).toEqual(["Act 3", "Act 1"]);
        const restaId = await tema("resta");
        expect((await d.como((tx) => historial(tx, { temaId: restaId }))).items).toHaveLength(0);

        const p1 = await d.como((tx) => historial(tx, { limite: 2 }));
        const p2 = await d.como((tx) => historial(tx, { limite: 2, cursor: p1.nextCursor }));
        expect([...p1.items, ...p2.items].map((e) => e.asignacionId)).toEqual(h.items.map((e) => e.asignacionId));
        expect(p2.nextCursor).toBeNull();
    });

    it("otro docente no ve las actividades ni el historial ajenos", async () => {
        const a = await docenteConAlumnos(["Ana"]);
        const b = await docenteConAlumnos(["Beto"]);
        await a.como(async (tx) => crearActividad(tx, a.docenteId, base(await tema("suma"), { tipo: "grupo", grupoId: a.grupo.id })));
        expect((await b.como((tx) => actividadesAsignadas(tx, { estado: "todas" }))).items).toHaveLength(0);
        expect((await b.como((tx) => historial(tx, {}))).items).toHaveLength(0);
    });
});
