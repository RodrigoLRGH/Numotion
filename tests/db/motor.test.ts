// P-API-02 · motor de ejercicios (EXP-04.1, 04.4–04.6, 04.10) y P-DB-05 · ajustes de nivel registrados.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { registrarDocente } from "../../src/modules/shared/servidor/auth";
import { conContexto, type Contexto } from "../../src/modules/shared/servidor/db";
import { crearAlumno, crearGrupo } from "../../src/modules/docente/servidor/grupos";
import { crearActividad } from "../../src/modules/docente/servidor/actividades";
import {
    hashRespuesta,
    iniciarActividad,
    misActividades,
    pedirGuia,
    registrarIntento,
    siguienteEjercicio,
    type ResultadoIntento,
} from "../../src/modules/alumno/servidor/motor";
import { sql } from "./fixture";

async function escenario(opciones: { num?: number; fecha?: string; alumnos?: number; tipo?: "seleccion_multiple" | "completar_operacion" } = {}) {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad') ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente Motor", `motor-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctxD: Contexto = { rol: "docente", id: docente.id };
    const grupo = await conContexto(ctxD, (tx) => crearGrupo(tx, docente.id, { nombre: "3M", grado: 3, cicloEscolar: "2026-2027" }));
    const ids: string[] = [];
    for (let i = 0; i < (opciones.alumnos ?? 1); i++) {
        const r = await conContexto(ctxD, (tx) => crearAlumno(tx, grupo.id, { nombre: `Alumno${i}`, apellidos: "", tutorNombre: "T", tutorEmail: "t@c.mx" }));
        if (!r.ok) throw new Error(r.message);
        ids.push(r.alumno.id);
    }
    const [{ id: suma }] = await sql`SELECT id FROM tema WHERE clave = 'suma'`;
    const [{ hoy }] = await sql`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
    const act = await conContexto(ctxD, (tx) => crearActividad(tx, docente.id, {
        nombre: "Sumas motor", temaId: suma, tipoInteraccion: opciones.tipo ?? "seleccion_multiple",
        fechaAsignacion: opciones.fecha ?? hoy, numEjercicios: opciones.num ?? 3, destino: { tipo: "grupo", grupoId: grupo.id },
    }));
    if (!act.ok) throw new Error(act.message);
    const [{ id: asignacionId }] = await sql`SELECT id FROM asignacion_alumno WHERE actividad_id = ${act.actividadId} AND alumno_id = ${ids[0]}`;
    const como = <T>(fn: Parameters<typeof conContexto<T>>[1], alumno = ids[0]) => conContexto({ rol: "alumno", id: alumno }, fn);
    return { alumnoId: ids[0], otros: ids.slice(1), asignacionId, temaSuma: suma, como, actividadId: act.actividadId };
}

type Escenario = Awaited<ReturnType<typeof escenario>>;

async function ejercicioActual(e: Escenario) {
    const s = await e.como((tx) => siguienteEjercicio(tx, e.alumnoId, e.asignacionId));
    if (!("ejercicio" in s)) throw new Error(JSON.stringify(s));
    const [{ respuesta }] = await sql`SELECT respuesta FROM ejercicio WHERE id = ${s.ejercicio.id}`;
    return { ...s, correcta: respuesta.valor as string };
}

async function responder(e: Escenario, bien: boolean, extra: Partial<{ clienteId: string; tiempoMs: number }> = {}): Promise<ResultadoIntento> {
    const actual = await ejercicioActual(e);
    const r = await e.como((tx) => registrarIntento(tx, e.alumnoId, {
        clienteId: extra.clienteId ?? randomUUID(), asignacionId: e.asignacionId, ejercicioId: actual.ejercicio.id,
        respuesta: bien ? actual.correcta : "-999", tiempoMs: extra.tiempoMs ?? 5000, ayudaSolicitada: false,
    }));
    if ("error" in r) throw new Error(r.error);
    return r;
}

describe("Mis actividades e inicio (EXP-04.1)", () => {
    it("lista solo asignaciones con fecha de hoy o anterior", async () => {
        const e = await escenario();
        const futura = await escenario({ fecha: "2099-01-01" });
        expect((await e.como((tx) => misActividades(tx, e.alumnoId))).map((a) => [a.nombre, a.estado, a.progreso])).toEqual([
            ["Sumas motor", "pendiente", { resueltos: 0, total: 3 }],
        ]);
        expect(await futura.como((tx) => misActividades(tx, futura.alumnoId))).toEqual([]);
        expect(await futura.como((tx) => iniciarActividad(tx, futura.alumnoId, futura.asignacionId))).toEqual({ error: "no_encontrada" });
    });

    it("el ejercicio público no trae respuesta ni pasos, sí un hash verificable, y se retoma el mismo", async () => {
        const e = await escenario();
        const ini = await e.como((tx) => iniciarActividad(tx, e.alumnoId, e.asignacionId));
        if (!("ejercicio" in ini)) throw new Error("sin ejercicio");
        expect(ini.ejercicio).not.toHaveProperty("respuesta");
        expect(ini.ejercicio).not.toHaveProperty("pasos");
        expect(JSON.stringify(ini)).not.toContain("datos");
        const actual = await ejercicioActual(e);
        expect(actual.ejercicio.id).toBe(ini.ejercicio.id);
        expect(ini.ejercicio.hashRespuesta).toBe(hashRespuesta(ini.ejercicio.id, actual.correcta));
        expect(ini.ejercicio.opciones).toContain(actual.correcta);
    });

    it("al iniciar recalcula el nivel con el diagnóstico del día y lo registra como 'inicial'", async () => {
        const e = await escenario();
        const [s] = await sql`INSERT INTO sesion_alumno (alumno_id, fecha) VALUES (${e.alumnoId}, fn_hoy_local()) RETURNING id`;
        await sql`INSERT INTO diagnostico_mat_resultado (sesion_id, alumno_id, tema_id, aciertos, total, nivel_dominio, tiempo_total_ms)
                  VALUES (${s.id}, ${e.alumnoId}, ${e.temaSuma}, 3, 3, 4, 1000)`;
        await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${s.id}, ${e.alumnoId}, 'positivo')`;
        const ini = await e.como((tx) => iniciarActividad(tx, e.alumnoId, e.asignacionId));
        expect("nivel" in ini && ini.nivel).toBe(4);
        const ajustes = await sql`SELECT nivel_anterior, nivel_nuevo, motivo FROM ajuste_dificultad WHERE asignacion_id = ${e.asignacionId}`;
        expect(ajustes).toEqual([{ nivel_anterior: 2, nivel_nuevo: 4, motivo: "inicial" }]);
        // Una sola vez: volver a iniciar no recalcula
        await e.como((tx) => iniciarActividad(tx, e.alumnoId, e.asignacionId));
        expect(await sql`SELECT id FROM ajuste_dificultad WHERE asignacion_id = ${e.asignacionId}`).toHaveLength(1);
    });
});

describe("intentos, guía y puntos (EXP-04.4, 04.6)", () => {
    it("acierto al primer intento: 10 puntos, cierra el ejercicio y la asignación pasa a en curso", async () => {
        const e = await escenario();
        const r = await responder(e, true);
        expect(r).toMatchObject({ correcta: true, puntos: 10, ejercicioCerrado: true, guia: null, asignacion: { estado: "en_curso", resueltos: 1, total: 3 } });
    });

    it("es idempotente por clienteId: mismo resultado y un solo intento guardado", async () => {
        const e = await escenario();
        const clienteId = randomUUID();
        const actual = await ejercicioActual(e);
        const datos = { clienteId, asignacionId: e.asignacionId, ejercicioId: actual.ejercicio.id, respuesta: actual.correcta, tiempoMs: 4000, ayudaSolicitada: false };
        const r1 = await e.como((tx) => registrarIntento(tx, e.alumnoId, datos));
        const r2 = await e.como((tx) => registrarIntento(tx, e.alumnoId, datos));
        expect(r2).toEqual(r1);
        expect(await sql`SELECT id FROM intento_ejercicio WHERE asignacion_id = ${e.asignacionId}`).toHaveLength(1);
        // Otro alumno no puede reutilizar ese clienteId
        const otro = await escenario();
        const suyo = await ejercicioActual(otro);
        expect(await otro.como((tx) => registrarIntento(tx, otro.alumnoId, { ...datos, asignacionId: otro.asignacionId, ejercicioId: suyo.ejercicio.id })))
            .toEqual({ error: "cliente_repetido" });
    });

    it("3.er fallo abre la guía paso a paso; 4.º fallo cierra con la explicación final y la respuesta", async () => {
        const e = await escenario();
        const { correcta } = await ejercicioActual(e);
        const r1 = await responder(e, false);
        expect(r1).toMatchObject({ correcta: false, ejercicioCerrado: false, intentosRestantes: 3, guia: null, puntos: 0 });
        await responder(e, false);
        const r3 = await responder(e, false);
        expect(r3.guia?.modo).toBe("paso_a_paso");
        expect(r3.guia?.pasos.length).toBeGreaterThanOrEqual(2);
        const r4 = await responder(e, false);
        expect(r4).toMatchObject({ ejercicioCerrado: true, intentosRestantes: 0, guia: { modo: "final", respuestaCorrecta: correcta } });
        const tipos = await sql`SELECT numero_intento, tipo_error, guia_mostrada FROM intento_ejercicio WHERE asignacion_id = ${e.asignacionId} ORDER BY numero_intento`;
        expect(tipos.map((t) => t.numero_intento)).toEqual([1, 2, 3, 4]);
        expect(tipos.every((t) => t.tipo_error !== null)).toBe(true);
        expect(tipos.map((t) => t.guia_mostrada)).toEqual(["ninguna", "ninguna", "paso_a_paso", "final"]);
    });

    it("puntos por intento: 7 al segundo; tras pedir ayuda, 3", async () => {
        const e = await escenario({ num: 5 });
        await responder(e, false);
        expect((await responder(e, true)).puntos).toBe(7);
        const actual = await ejercicioActual(e);
        const guia = await e.como((tx) => pedirGuia(tx, e.alumnoId, e.asignacionId, actual.ejercicio.id));
        expect(guia?.modo).toBe("paso_a_paso");
        expect((await responder(e, true)).puntos).toBe(3);
    });

    it("no acepta respuestas a un ejercicio que no es el vigente ni a asignaciones ajenas", async () => {
        const e = await escenario({ alumnos: 2 });
        const actual = await ejercicioActual(e);
        await responder(e, true); // cierra el ejercicio
        expect(await e.como((tx) => registrarIntento(tx, e.alumnoId, {
            clienteId: randomUUID(), asignacionId: e.asignacionId, ejercicioId: actual.ejercicio.id, respuesta: actual.correcta, tiempoMs: 1, ayudaSolicitada: false,
        }))).toEqual({ error: "ejercicio_no_vigente" });
        expect(await e.como((tx) => siguienteEjercicio(tx, e.otros[0], e.asignacionId), e.otros[0])).toEqual({ error: "no_encontrada" });
    });
});

describe("adaptación de nivel (EXP-04.5, P-DB-05)", () => {
    it("3 aciertos rápidos al primer intento suben 1 nivel y el siguiente ejercicio ya es de ese nivel", async () => {
        const e = await escenario({ num: 6 });
        for (let i = 0; i < 2; i++) expect((await responder(e, true)).nivel.actual).toBe(2);
        const r = await responder(e, true);
        expect(r.nivel).toEqual({ anterior: 2, actual: 3, motivo: "desempeno" });
        const [ajuste] = await sql`SELECT nivel_anterior, nivel_nuevo, motivo, detalle FROM ajuste_dificultad WHERE asignacion_id = ${e.asignacionId}`;
        expect(ajuste).toMatchObject({ nivel_anterior: 2, nivel_nuevo: 3, motivo: "desempeno" });
        expect(ajuste.detalle.reglas).toEqual(["R4"]);
        expect((await ejercicioActual(e)).nivel).toBe(3);
        expect((await ejercicioActual(e)).ejercicio.nivel).toBe(3);
        // Enfriamiento: el siguiente acierto no vuelve a subir
        expect((await responder(e, true)).nivel.actual).toBe(3);
    });

    it("3 ejercicios fallados bajan 1 nivel por desempeño", async () => {
        const e = await escenario({ num: 6 });
        let r: ResultadoIntento | null = null;
        for (let ej = 0; ej < 3; ej++) for (let i = 0; i < 4; i++) r = await responder(e, false);
        // Sin cámara ni inactividad el IF tope es 0.5 (< 0.6): baja R3 al cerrar el 3.er ejercicio
        expect(r!.nivel).toEqual({ anterior: 2, actual: 1, motivo: "desempeno" });
        const ajustes = await sql`SELECT motivo, detalle FROM ajuste_dificultad WHERE asignacion_id = ${e.asignacionId}`;
        expect(ajustes.map((x) => [x.motivo, x.detalle.reglas, x.detalle.IF])).toEqual([["desempeno", ["R3"], 0.5]]);
    });
});

describe("completar la actividad (EXP-04.10)", () => {
    it("al resolver el último ejercicio entrega la recompensa y crea el resultado académico", async () => {
        const e = await escenario();
        await responder(e, true);
        await responder(e, true);
        for (let i = 0; i < 3; i++) await responder(e, false);
        const ultimo = await responder(e, false);
        expect(ultimo.asignacion.estado).toBe("completada");
        expect(ultimo.recompensa).toEqual({ puntos: 20, estrellas: 1, resultadoFinal: 6.67 });
        const s = await e.como((tx) => siguienteEjercicio(tx, e.alumnoId, e.asignacionId));
        expect(s).toMatchObject({ completada: true, recompensa: { puntos: 20 } });
        const [r] = await sql`SELECT tipo, calificacion FROM resultado_academico WHERE asignacion_id = ${e.asignacionId}`;
        expect(r).toEqual({ tipo: "actividad_numotion", calificacion: "6.67" });
        expect((await e.como((tx) => misActividades(tx, e.alumnoId)))[0]).toMatchObject({ estado: "completada", resultadoFinal: "6.67" });
    });

    it("completar la operación sirve ejercicios con el faltante del tema", async () => {
        const e = await escenario({ tipo: "completar_operacion" });
        const a = await ejercicioActual(e);
        expect(a.ejercicio.tipoInteraccion).toBe("completar_operacion");
        expect(a.ejercicio.expresion).toMatch(/□/);
        expect(a.ejercicio.expresion).toContain("+");
    });
});
