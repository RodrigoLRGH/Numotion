// P-DB-01 (racha con práctica libre), P-API-09 (panel), P-COMP-03 lado servidor (perfil sin datos
// emocionales) y EXP-06.1 (puntos, nivel e insignias una sola vez).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { completarPractica, iniciarPractica, intentoPractica, juegosDisponibles, otorgarInsignias, panel, perfil } from "../../apps/api/src/modules/alumno/gamificacion";
import { escenarioCompleto, responderActividad, type Escenario } from "./escenario";
import { sql } from "./fixture";

async function jugar(e: Escenario, bien = true, alumno = e.alumnos[0]) {
    const p = await e.comoAlumno((tx) => iniciarPractica(tx, alumno, "seleccion_multiple", e.temaId), alumno);
    if ("error" in p) throw new Error(p.error);
    for (const ej of p.ejercicios) {
        const [{ respuesta }] = await sql`SELECT respuesta FROM ejercicio WHERE id = ${ej.id}`;
        for (let i = 0; i < (bien ? 1 : 3); i++) {
            const r = await e.comoAlumno((tx) => intentoPractica(tx, alumno, p.practicaId, { clienteId: randomUUID(), ejercicioId: ej.id, respuesta: bien ? respuesta.valor : "-999", tiempoMs: 3000 }), alumno);
            if ("error" in r) throw new Error(r.error);
        }
    }
    return p;
}

describe("práctica libre (EXP-06.6)", () => {
    it("ofrece los juegos del grado y sirve 5 ejercicios al último nivel del tema (o 2)", async () => {
        const e = await escenarioCompleto();
        const juegos = await e.comoAlumno((tx) => juegosDisponibles(tx, e.alumnos[0]));
        expect(juegos.some((j) => j.temaId === e.temaId && j.tipo === "suma_figuras")).toBe(true);
        // Grado 3: división (3–6) sí; ningún tema fuera de rango
        expect(juegos.some((j) => j.temaClave === "division")).toBe(true);
        const p = await e.comoAlumno((tx) => iniciarPractica(tx, e.alumnos[0], "seleccion_multiple", e.temaId));
        if ("error" in p) throw new Error(p.error);
        expect(p.ejercicios).toHaveLength(5);
        expect(p.nivel).toBe(2);
        expect(JSON.stringify(p)).not.toContain("respuesta\":");
    });

    it("no se completa con ejercicios abiertos; al completar da 5 puntos, suma racha una vez al día y es idempotente", async () => {
        const e = await escenarioCompleto();
        const [{ habil }] = await sql`SELECT fn_es_dia_habil(fn_hoy_local()) AS habil`;
        const p = await e.comoAlumno((tx) => iniciarPractica(tx, e.alumnos[0], "seleccion_multiple", e.temaId));
        if ("error" in p) throw new Error(p.error);
        expect(await e.comoAlumno((tx) => completarPractica(tx, e.alumnos[0], p.practicaId))).toEqual({ error: "incompleta" });

        const jugada = await jugar(e);
        const r = await e.comoAlumno((tx) => completarPractica(tx, e.alumnos[0], jugada.practicaId));
        if ("error" in r) throw new Error(r.error);
        expect(r).toMatchObject({ puntos: 5, aciertos: 5, total: 5 });
        expect(r.racha).toEqual(habil ? { actual: 1, mejor: 1, incremento: true } : { actual: 0, mejor: 0, incremento: false });
        expect(r.nuevasInsignias).toEqual([]);
        // Segunda práctica el mismo día: puntos sí, racha no
        const otra = await jugar(e);
        const r2 = await e.comoAlumno((tx) => completarPractica(tx, e.alumnos[0], otra.practicaId));
        if ("error" in r2) throw new Error(r2.error);
        expect(r2.racha.incremento).toBe(false);
        // Idempotente
        const r3 = await e.comoAlumno((tx) => completarPractica(tx, e.alumnos[0], otra.practicaId));
        expect(r3).toMatchObject({ puntos: 5, nuevasInsignias: [] });
        const [perfil] = await sql`SELECT puntos_totales FROM perfil_gamificacion WHERE alumno_id = ${e.alumnos[0]}`;
        expect(perfil.puntos_totales).toBe(10);
    });

    it("un ejercicio se cierra al 3.er fallo con la solución; intentos idempotentes y ajenos rechazados", async () => {
        const e = await escenarioCompleto({ alumnos: 2 });
        const p = await e.comoAlumno((tx) => iniciarPractica(tx, e.alumnos[0], "seleccion_multiple", e.temaId));
        if ("error" in p) throw new Error(p.error);
        const ej = p.ejercicios[0];
        const datos = { clienteId: randomUUID(), ejercicioId: ej.id, respuesta: "-999", tiempoMs: 1000 };
        const r1 = await e.comoAlumno((tx) => intentoPractica(tx, e.alumnos[0], p.practicaId, datos));
        expect(await e.comoAlumno((tx) => intentoPractica(tx, e.alumnos[0], p.practicaId, datos))).toEqual(r1);
        expect(r1).toMatchObject({ correcta: false, ejercicioCerrado: false, intentosRestantes: 2, solucion: null });
        await e.comoAlumno((tx) => intentoPractica(tx, e.alumnos[0], p.practicaId, { ...datos, clienteId: randomUUID() }));
        const r3 = await e.comoAlumno((tx) => intentoPractica(tx, e.alumnos[0], p.practicaId, { ...datos, clienteId: randomUUID() }));
        expect(r3).toMatchObject({ ejercicioCerrado: true, progreso: { resueltos: 1, total: 5 } });
        if ("error" in r3) throw new Error(r3.error);
        expect(r3.solucion?.pasos.length).toBeGreaterThanOrEqual(2);
        expect(await e.comoAlumno((tx) => intentoPractica(tx, e.alumnos[0], p.practicaId, { ...datos, clienteId: randomUUID() }))).toEqual({ error: "ejercicio_no_vigente" });
        // Otro alumno no ve la práctica
        expect(await e.comoAlumno((tx) => intentoPractica(tx, e.alumnos[1], p.practicaId, { ...datos, clienteId: randomUUID() }), e.alumnos[1])).toEqual({ error: "no_encontrada" });
    });
});

describe("insignias y nivel (EXP-06.1)", () => {
    it("completar la 1.ª actividad otorga 'primera_actividad' una sola vez y la recompensa la anuncia", async () => {
        const e = await escenarioCompleto({ num: 3 });
        await responderActividad(e, true);
        await responderActividad(e, true);
        const ultimo = await responderActividad(e, true);
        expect(ultimo.asignacion.estado).toBe("completada");
        expect(ultimo.nuevasInsignias.map((i) => i.clave)).toContain("primera_actividad");
        expect(await e.comoAlumno((tx) => otorgarInsignias(tx, e.alumnos[0]))).toEqual([]);
        expect(await sql`SELECT 1 FROM alumno_insignia ai JOIN insignia i ON i.id = ai.insignia_id WHERE ai.alumno_id = ${e.alumnos[0]} AND i.clave = 'primera_actividad'`).toHaveLength(1);
    });

    it("'explorador' con 4 tipos de juego distintos", async () => {
        const e = await escenarioCompleto();
        const tipos = ["seleccion_multiple", "arrastrar", "completar_operacion", "suma_figuras"] as const;
        let ultimas: string[] = [];
        for (const tipo of tipos) {
            const p = await e.comoAlumno((tx) => iniciarPractica(tx, e.alumnos[0], tipo, e.temaId));
            if ("error" in p) throw new Error(p.error);
            await sql`INSERT INTO intento_ejercicio (practica_id, alumno_id, ejercicio_id, nivel, respuesta, correcta, numero_intento, tiempo_ms, cliente_id)
                      SELECT ${p.practicaId}, ${e.alumnos[0]}, x, 2, '{}', true, 1, 100, gen_random_uuid() FROM unnest(${p.ejercicios.map((x) => x.id)}::uuid[]) x`;
            const r = await e.comoAlumno((tx) => completarPractica(tx, e.alumnos[0], p.practicaId));
            if ("error" in r) throw new Error(r.error);
            ultimas = r.nuevasInsignias.map((i) => i.clave);
        }
        expect(ultimas).toContain("explorador");
    });

    it("subir de nivel de gamificación se informa en el intento", async () => {
        const e = await escenarioCompleto({ num: 5 });
        await sql`UPDATE perfil_gamificacion SET puntos_totales = 95 WHERE alumno_id = ${e.alumnos[0]}`;
        const r = await responderActividad(e, true);
        expect(r.subioNivel).toBe(2);
        const [p] = await sql`SELECT nivel_gamificacion FROM perfil_gamificacion WHERE alumno_id = ${e.alumnos[0]}`;
        expect(p.nivel_gamificacion).toBe(2);
    });
});

describe("panel y perfil (RF-63, RF-65, RF-66, RF-22)", () => {
    it("panel: racha, semana L–V, nivel, insignias, conteo de actividades y mensaje estable en el día", async () => {
        const e = await escenarioCompleto();
        const p1 = await e.comoAlumno((tx) => panel(tx, e.alumnos[0]));
        expect(p1.racha.semana).toHaveLength(5);
        expect(p1.racha.semana.map((d) => d.dia)).toEqual(["L", "M", "Mi", "J", "V"]);
        expect(p1.gamificacion).toMatchObject({ nivel: 1, puntos: 0, puntosSiguienteNivel: 100 });
        expect(p1.actividades).toEqual({ pendientes: 1, enCurso: 0 });
        expect(p1.mensajeMotivacional).toMatch(/Alumno0/);
        expect(p1.mensajeMotivacional).not.toMatch(/\{nombre\}|\{racha\}/);
        const p2 = await e.comoAlumno((tx) => panel(tx, e.alumnos[0]));
        expect(p2.mensajeMotivacional).toBe(p1.mensajeMotivacional);
    });

    it("no repite el mensaje del día anterior", async () => {
        const e = await escenarioCompleto();
        const p1 = await e.comoAlumno((tx) => panel(tx, e.alumnos[0]));
        await sql`UPDATE perfil_gamificacion SET ultimo_mensaje_fecha = fn_hoy_local() - 1 WHERE alumno_id = ${e.alumnos[0]}`;
        const p2 = await e.comoAlumno((tx) => panel(tx, e.alumnos[0]));
        expect(p2.mensajeMotivacional).not.toBe(p1.mensajeMotivacional);
    });

    it("perfil: nombre, grado, grupo, personaje e insignias; sin datos emocionales", async () => {
        const e = await escenarioCompleto();
        await sql`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${e.sesiones[0]}, ${e.alumnos[0]}, 'frustracion')`;
        const p = await e.comoAlumno((tx) => perfil(tx, e.alumnos[0]));
        expect(p).toMatchObject({ nombre: "Alumno0 Prueba", grado: 3, grupo: "3E" });
        expect(p.gamificacion.personaje.emoji).toBeTruthy();
        expect(p.insigniasPorGanar.length).toBeGreaterThan(5);
        expect(JSON.stringify(p)).not.toMatch(/frustracion|estado_inicial|afecto/);
    });
});
