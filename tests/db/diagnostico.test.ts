// P-API-03 · Diagnósticos → retroalimentación y compuerta (EXP-02), servicios contra PostgreSQL.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { registrarDocente } from "../../src/modules/shared/servidor/auth";
import { conContexto, type Contexto } from "../../src/modules/shared/servidor/db";
import { crearAlumno, crearGrupo } from "../../src/modules/docente/servidor/grupos";
import {
    estadoDiagnosticos,
    finalizarMatematico,
    finalizarPanas,
    panasDelDia,
    responderPanas,
    responderPregunta,
    siguientePregunta,
} from "../../src/modules/alumno/servidor/diagnostico";
import { sql } from "./fixture";

async function nuevoAlumno(grado = 3) {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad')
              ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente Diag", `diag-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctxDocente = { rol: "docente" as const, id: docente.id };
    const grupo = await conContexto(ctxDocente, (tx) => crearGrupo(tx, docente.id, { nombre: "G", grado, cicloEscolar: "2026-2027" }));
    const alta = await conContexto(ctxDocente, (tx) =>
        crearAlumno(tx, grupo.id, { nombre: "Sofía", apellidos: "", tutorNombre: "Tutor", tutorEmail: "t@correo.mx" }));
    if (!alta.ok) throw new Error(alta.message);
    await sql`UPDATE consentimiento_tutor SET aceptado_en = now(), acepta_plataforma = true WHERE alumno_id = ${alta.alumno.id}`;
    const ctx: Contexto = { rol: "alumno", id: alta.alumno.id };
    const como = <T>(fn: Parameters<typeof conContexto<T>>[1]) => conContexto(ctx, fn);
    return { alumnoId: alta.alumno.id, ctxDocente, como };
}

type Alumno = Awaited<ReturnType<typeof nuevoAlumno>>;

async function completarPanas({ alumnoId, como }: Alumno, valores: { positivo: number; negativo: number }) {
    const { items } = await como((tx) => panasDelDia(tx, alumnoId));
    const afectos = await sql`SELECT id, afecto FROM panas_item WHERE version = 'v1'`;
    for (const item of items) {
        const afecto = afectos.find((a) => a.id === item.id)!.afecto as "positivo" | "negativo";
        expect(await como((tx) => responderPanas(tx, alumnoId, item.id, valores[afecto]))).toBe("ok");
    }
    expect(await como((tx) => finalizarPanas(tx, alumnoId))).toEqual({ ok: true });
}

/** Responde todo el diagnóstico; `acierta(nivel)` decide si contesta bien. Devuelve cuántas preguntas hubo. */
async function responderDiagnostico({ alumnoId, como }: Alumno, acierta: (nivel: number) => boolean): Promise<number> {
    let n = 0;
    for (;;) {
        const s = await como((tx) => siguientePregunta(tx, alumnoId));
        if ("terminado" in s) return n;
        if ("error" in s) throw new Error(s.error);
        expect(s.pregunta).not.toHaveProperty("respuesta");
        expect(s.pregunta).not.toHaveProperty("pasos");
        const [{ pregunta, nivel }] = await sql`SELECT pregunta, nivel FROM diagnostico_mat_respuesta WHERE id = ${s.pregunta.id}`;
        const respuesta = acierta(nivel) ? pregunta.respuesta : "respuesta-incorrecta";
        expect(await como((tx) => responderPregunta(tx, alumnoId, s.pregunta.id, respuesta, 1500))).toEqual({ correcta: acierta(nivel) });
        n++;
        if (n > 40) throw new Error("el diagnóstico no termina");
    }
}

describe("PANAS-C del día (EXP-02.1, 02.5)", () => {
    it("guarda incrementalmente, permite corregir y retoma lo respondido", async () => {
        const a = await nuevoAlumno();
        const inicio = await a.como((tx) => panasDelDia(tx, a.alumnoId));
        expect(inicio.items).toHaveLength(10);
        expect(inicio.escala.map((e) => e.valor)).toEqual([1, 2, 3, 4, 5]);
        expect(inicio).toMatchObject({ respondidos: [], completado: false });

        const [i1, i2] = inicio.items;
        await a.como((tx) => responderPanas(tx, a.alumnoId, i1.id, 2));
        await a.como((tx) => responderPanas(tx, a.alumnoId, i1.id, 4)); // corrige
        await a.como((tx) => responderPanas(tx, a.alumnoId, i2.id, 1));
        expect((await a.como((tx) => panasDelDia(tx, a.alumnoId))).respondidos).toEqual([i1.id, i2.id]);
        const [{ respuestas }] = await sql`SELECT respuestas FROM panas_resultado WHERE alumno_id = ${a.alumnoId}`;
        expect(respuestas).toHaveLength(2);

        expect(await a.como((tx) => finalizarPanas(tx, a.alumnoId))).toEqual({ ok: false, faltan: 8 });
        expect(await a.como((tx) => responderPanas(tx, a.alumnoId, i1.id, 9))).toBe("valor_invalido");
        expect(await a.como((tx) => responderPanas(tx, a.alumnoId, randomUUID(), 3))).toBe("item_desconocido");
    });

    it("calcula AP/AN al finalizar y después ya no acepta cambios", async () => {
        const a = await nuevoAlumno();
        await completarPanas(a, { positivo: 4, negativo: 2 });
        const [p] = await sql`SELECT afecto_positivo, afecto_negativo FROM panas_resultado WHERE alumno_id = ${a.alumnoId}`;
        expect(p).toEqual({ afecto_positivo: "4.00", afecto_negativo: "2.00" });
        const { items } = await a.como((tx) => panasDelDia(tx, a.alumnoId));
        expect(await a.como((tx) => responderPanas(tx, a.alumnoId, items[0].id, 1))).toBe("completado");
        expect(await a.como((tx) => finalizarPanas(tx, a.alumnoId))).toEqual({ ok: true }); // idempotente
    });
});

describe("diagnóstico matemático y retroalimentación (EXP-02.2–02.4, 02.6)", () => {
    it("exige el PANAS-C antes del matemático", async () => {
        const a = await nuevoAlumno();
        expect(await a.como((tx) => siguientePregunta(tx, a.alumnoId))).toEqual({ error: "panas_pendiente" });
        expect(await a.como((tx) => finalizarMatematico(tx, a.alumnoId))).toEqual({ ok: false, motivo: "panas_pendiente" });
    });

    it("retoma la misma pregunta si se pide dos veces y no deja finalizar a medias", async () => {
        const a = await nuevoAlumno();
        await completarPanas(a, { positivo: 3, negativo: 2 });
        const p1 = await a.como((tx) => siguientePregunta(tx, a.alumnoId));
        const p2 = await a.como((tx) => siguientePregunta(tx, a.alumnoId));
        expect(p2).toEqual(p1);
        expect(await a.como((tx) => finalizarMatematico(tx, a.alumnoId))).toEqual({ ok: false, motivo: "incompleto" });
    });

    it("escalona por tema, registra dominio y desbloquea el panel con una sola retroalimentación", async () => {
        const a = await nuevoAlumno(3);
        await completarPanas(a, { positivo: 2, negativo: 4 }); // AN alto → estado inicial frustración
        expect(await a.como(estadoDiagnosticos)).toEqual({ panas: true, matematico: false });

        // Acierta hasta el nivel 3: dominio 3 en cada tema
        const preguntas = await responderDiagnostico(a, (nivel) => nivel <= 3);
        const temas = await sql`SELECT clave FROM tema WHERE 3 BETWEEN grado_min AND grado_max
                                  AND clave IN ('numeros','suma','resta','multiplicacion','division')`;
        expect(preguntas).toBeGreaterThanOrEqual(3 * temas.length);
        expect(preguntas).toBeLessThanOrEqual(5 * temas.length);

        const fin = await a.como((tx) => finalizarMatematico(tx, a.alumnoId));
        expect(fin.ok).toBe(true);
        if (!fin.ok) return;
        expect(Object.keys(fin.dominio).sort()).toEqual(temas.map((t) => t.clave).sort());
        expect(Object.values(fin.dominio).every((n) => n === 3)).toBe(true);
        expect(await a.como(estadoDiagnosticos)).toEqual({ panas: true, matematico: true });

        const [r] = await sql`SELECT estado_inicial, nivel_sugerido_por_tema FROM retroalimentacion WHERE id = ${fin.retroalimentacionId}`;
        expect(r.estado_inicial).toBe("frustracion");
        expect(Object.values(r.nivel_sugerido_por_tema).every((n) => n === 2)).toBe(true); // 3 − 1 por frustración

        // Idempotente: misma retroalimentación, sin duplicar resultados
        const otra = await a.como((tx) => finalizarMatematico(tx, a.alumnoId));
        expect(otra).toMatchObject({ ok: true, retroalimentacionId: fin.retroalimentacionId });
        const [{ n }] = await sql`SELECT count(*)::int AS n FROM retroalimentacion WHERE alumno_id = ${a.alumnoId}`;
        expect(n).toBe(1);
    });

    it("al día siguiente vuelve a pedir los diagnósticos y aplica la versión corta (1 por tema)", async () => {
        const a = await nuevoAlumno(3);
        await completarPanas(a, { positivo: 4, negativo: 1 });
        await responderDiagnostico(a, (nivel) => nivel <= 4);
        expect((await a.como((tx) => finalizarMatematico(tx, a.alumnoId))).ok).toBe(true);

        // Simula que eso pasó ayer
        await sql`UPDATE sesion_alumno SET fecha = fecha - 1 WHERE alumno_id = ${a.alumnoId}`;
        expect(await a.como(estadoDiagnosticos)).toEqual({ panas: false, matematico: false });

        await completarPanas(a, { positivo: 4, negativo: 1 });
        const nTemas = (await sql`SELECT count(DISTINCT tema_id)::int AS n FROM diagnostico_mat_resultado WHERE alumno_id = ${a.alumnoId}`)[0].n;
        // Falla todas: en la versión corta el dominio baja un nivel (4 → 3)
        expect(await responderDiagnostico(a, () => false)).toBe(nTemas);
        const fin = await a.como((tx) => finalizarMatematico(tx, a.alumnoId));
        expect(fin.ok && Object.values(fin.dominio).every((n) => n === 3)).toBe(true);
    });

    it("una pregunta ya respondida o ajena no se puede responder", async () => {
        const a = await nuevoAlumno();
        const b = await nuevoAlumno();
        await completarPanas(a, { positivo: 3, negativo: 2 });
        const s = await a.como((tx) => siguientePregunta(tx, a.alumnoId));
        if (!("pregunta" in s)) throw new Error("sin pregunta");
        expect(await b.como((tx) => responderPregunta(tx, b.alumnoId, s.pregunta.id, "1", 10))).toBeNull();
        expect(await a.como((tx) => responderPregunta(tx, a.alumnoId, s.pregunta.id, "1", 10))).not.toBeNull();
        expect(await a.como((tx) => responderPregunta(tx, a.alumnoId, s.pregunta.id, "1", 10))).toBeNull();
    });

    it("el docente ve la retroalimentación de su alumno", async () => {
        const a = await nuevoAlumno();
        await completarPanas(a, { positivo: 3, negativo: 2 });
        await responderDiagnostico(a, () => true);
        await a.como((tx) => finalizarMatematico(tx, a.alumnoId));
        const filas = await conContexto(a.ctxDocente, (tx) => tx`SELECT estado_inicial FROM retroalimentacion WHERE alumno_id = ${a.alumnoId}`);
        expect(filas).toHaveLength(1);
    });
});
