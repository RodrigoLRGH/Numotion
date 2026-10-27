// P-DB-01, P-DB-02, P-DB-03, P-DB-05/06, P-DB-07/08 (docs/specs/04-pruebas/diseno/04-pruebas-de-base-de-datos-pgtap.md)
import { describe, expect, it } from "vitest";
import { capturarError, comoApp, crearEjercicio, crearFixture, crearSesion, enTransaccion, IDS, type Tx } from "./fixture";

const A1 = IDS.alumnoA1;

describe("P-DB-01 · racha (RF-67, RF-68)", () => {
    it("cuenta días hábiles consecutivos, una vez por día, sin contar fin de semana", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await tx`INSERT INTO racha_alumno (alumno_id, racha_actual, mejor_racha, ultimo_dia_habil)
                     VALUES (${A1}, 4, 4, '2026-10-23')`; // viernes
            const practicar = async (d: string) => {
                await tx`INSERT INTO practica_libre (alumno_id, juego, tema_id, iniciada_en)
                         VALUES (${A1}, 'identificar_numero', ${IDS.temaSuma}, ${d})`;
                await tx`UPDATE practica_libre SET completada_en = ${d} WHERE alumno_id = ${A1} AND completada_en IS NULL`;
            };
            const racha = async () => (await tx`SELECT racha_actual, mejor_racha FROM racha_alumno WHERE alumno_id = ${A1}`)[0];
            const vigente = async (hoy: string) =>
                (await tx`SELECT racha_actual FROM fn_racha_vigente(${A1}, ${hoy})`)[0].racha_actual;

            await practicar("2026-10-24 10:00-07"); // sábado
            expect((await racha()).racha_actual).toBe(4);
            await practicar("2026-10-26 10:00-07"); // lunes
            expect((await racha()).racha_actual).toBe(5);
            await practicar("2026-10-26 12:00-07"); // lunes otra vez
            expect((await racha()).racha_actual).toBe(5);
            expect(await vigente("2026-10-27")).toBe(5); // martes aún vigente
            expect(await vigente("2026-10-28")).toBe(0); // miércoles sin martes
            await practicar("2026-10-28 09:00-07"); // miércoles
            const r = await racha();
            expect(r.racha_actual).toBe(1);
            expect(r.mejor_racha).toBe(5);
        }));

    it("un día inhábil registrado no interrumpe la racha", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await tx`INSERT INTO dia_inhabil (fecha, descripcion) VALUES ('2026-11-16', 'Revolución')`; // lunes
            await tx`INSERT INTO racha_alumno (alumno_id, racha_actual, mejor_racha, ultimo_dia_habil)
                     VALUES (${A1}, 2, 2, '2026-11-13')`; // viernes
            const [r] = await tx`SELECT racha_actual FROM fn_racha_vigente(${A1}, '2026-11-17')`;
            expect(r.racha_actual).toBe(2);
        }));
});

describe("P-DB-02 · fn_nivel_inicial (RF-57)", () => {
    const casos: [string, number | null, string | null, number, number][] = [
        ["sin diagnóstico", null, null, 0, 2],
        ["dominio 4, positivo", 4, "positivo", 0, 4],
        ["dominio 4, frustración", 4, "frustracion", 0, 3],
        ["dominio 1, frustración", 1, "frustracion", 0, 1],
        ["dominio 5 hace 40 días", 5, null, 40, 2],
    ];
    for (const [nombre, dominio, estado, diasAtras, esperado] of casos) {
        it(nombre, () =>
            enTransaccion(async (tx) => {
                await crearFixture(tx);
                const sesion = await crearSesion(tx, A1);
                if (dominio !== null) {
                    await tx`INSERT INTO diagnostico_mat_resultado (sesion_id, alumno_id, tema_id, aciertos, total, nivel_dominio, tiempo_total_ms, creado_en)
                             VALUES (${sesion}, ${A1}, ${IDS.temaSuma}, 2, 3, ${dominio}, 1000, now() - make_interval(days => ${diasAtras}))`;
                }
                if (estado !== null) {
                    await tx`INSERT INTO retroalimentacion (sesion_id, alumno_id, estado_inicial) VALUES (${sesion}, ${A1}, ${estado})`;
                }
                const [r] = await tx`SELECT fn_nivel_inicial(${A1}, ${IDS.temaSuma}) AS n`;
                expect(r.n).toBe(esperado);
            }));
    }
});

async function asignacionDe3(tx: Tx): Promise<string> {
    await comoApp(tx, "docente", IDS.docenteA);
    const [{ id: act }] = await tx`SELECT fn_registrar_asignacion(${IDS.docenteA}, 'Sumas', ${IDS.temaSuma},
        'seleccion_multiple', '2026-10-27', 3::smallint, NULL, ${[A1]}::uuid[]) AS id`;
    const [{ id }] = await tx`SELECT id FROM asignacion_alumno WHERE actividad_id = ${act} AND alumno_id = ${A1}`;
    return id;
}

describe("P-DB-03 · trigger de avance de asignación (RF-60, RF-35)", () => {
    it("avanza, cierra al 4.º fallo, completa con resultado y bloquea intentos posteriores", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const [e1, e2, e3, e4] = [await crearEjercicio(tx), await crearEjercicio(tx), await crearEjercicio(tx), await crearEjercicio(tx)];
            const asig = await asignacionDe3(tx);
            await comoApp(tx, "alumno", A1);
            const intento = (ej: string, correcta: boolean, n: number) =>
                tx`INSERT INTO intento_ejercicio (asignacion_id, alumno_id, ejercicio_id, nivel, respuesta, correcta, numero_intento, tiempo_ms, cliente_id)
                   VALUES (${asig}, ${A1}, ${ej}, 2, '{"valor":2}', ${correcta}, ${n}, 1000, gen_random_uuid())`;
            const estado = async () => (await tx`SELECT * FROM asignacion_alumno WHERE id = ${asig}`)[0];

            await intento(e1, true, 1);
            let a = await estado();
            expect(a.estado).toBe("en_curso");
            expect(a.ejercicios_resueltos).toBe(1);
            expect(a.iniciada_en).not.toBeNull();

            for (const n of [1, 2, 3]) await intento(e2, false, n);
            expect((await estado()).ejercicios_resueltos).toBe(1);
            await intento(e2, false, 4);
            expect((await estado()).ejercicios_resueltos).toBe(2);

            await intento(e3, true, 1);
            a = await estado();
            expect(a.estado).toBe("completada");
            expect(a.resultado_final).toBe("6.67");

            const err = await capturarError(tx, (sp) => intento(e4, true, 1).then(() => sp));
            expect(err?.message).toContain("ASIGNACION_COMPLETADA");
        }));
});

describe("fn_registrar_asignacion (RF-56)", () => {
    it("exige destino excluyente y rechaza alumnos o grupos ajenos", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await comoApp(tx, "docente", IDS.docenteA);
            const registrar = (grupo: string | null, alumnos: string[]) => (sp: Tx) =>
                sp`SELECT fn_registrar_asignacion(${IDS.docenteA}, 'x', ${IDS.temaSuma}, 'seleccion_multiple',
                    '2026-10-27', 5::smallint, ${grupo}, ${alumnos}::uuid[])`;
            expect((await capturarError(tx, registrar(IDS.grupoA, [A1])))?.message).toBe("ASIGNACION_DESTINO_INVALIDO");
            expect((await capturarError(tx, registrar(null, [])))?.message).toBe("ASIGNACION_DESTINO_INVALIDO");
            expect((await capturarError(tx, registrar(IDS.grupoB, [])))?.message).toBe("GRUPO_NO_PERMITIDO");
            expect((await capturarError(tx, registrar(null, [IDS.alumnoB1])))?.message).toBe("ALUMNO_NO_PERMITIDO");
            expect(await capturarError(tx, registrar(IDS.grupoA, []))).toBeNull();
            const n = await tx`SELECT count(*)::int AS n FROM asignacion_alumno`;
            expect(n[0].n).toBe(2); // Ana y Beto
        }));

    it("no permite suplantar a otro docente", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            await comoApp(tx, "docente", IDS.docenteB);
            const err = await capturarError(tx, (sp) =>
                sp`SELECT fn_registrar_asignacion(${IDS.docenteA}, 'x', ${IDS.temaSuma}, 'seleccion_multiple',
                    '2026-10-27', 5::smallint, ${IDS.grupoA}, '{}'::uuid[])`);
            expect(err?.code).toBe("42501");
        }));
});

describe("P-DB-05/06 · restricciones", () => {
    it("rechaza niveles fuera de 1..5, duplicados y destinos inconsistentes", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const [{ id: act }] = await tx`INSERT INTO actividad (docente_id, nombre, tema_id, tipo_interaccion, fecha_asignacion, destino)
                VALUES (${IDS.docenteA}, 'x', ${IDS.temaSuma}, 'arrastrar', '2026-10-27', 'alumnos') RETURNING id`;
            const asignar = (nivel: number) => (sp: Tx) =>
                sp`INSERT INTO asignacion_alumno (actividad_id, alumno_id, nivel_inicial, nivel_actual) VALUES (${act}, ${A1}, ${nivel}, 2)`;
            expect((await capturarError(tx, asignar(0)))?.code).toBe("23514");
            expect((await capturarError(tx, asignar(6)))?.code).toBe("23514");
            expect(await capturarError(tx, asignar(2))).toBeNull();
            expect((await capturarError(tx, asignar(3)))?.code).toBe("23505");
            const err = await capturarError(tx, (sp) =>
                sp`INSERT INTO actividad (docente_id, nombre, tema_id, tipo_interaccion, fecha_asignacion, destino)
                   VALUES (${IDS.docenteA}, 'x', ${IDS.temaSuma}, 'arrastrar', '2026-10-27', 'grupo')`);
            expect(err?.code).toBe("23514");
        }));

    it("intento_ejercicio pertenece exactamente a una asignación o a una práctica", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const ej = await crearEjercicio(tx);
            const err = await capturarError(tx, (sp) =>
                sp`INSERT INTO intento_ejercicio (alumno_id, ejercicio_id, nivel, respuesta, correcta, numero_intento, tiempo_ms, cliente_id)
                   VALUES (${A1}, ${ej}, 2, '{}', true, 1, 10, gen_random_uuid())`);
            expect(err?.code).toBe("23514");
        }));
});

describe("P-DB-07/08 · retención, anonimización y esquema", () => {
    it("purga eventos de más de 180 días", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const s = await crearSesion(tx, A1);
            await tx`INSERT INTO evento_emocional (alumno_id, sesion_id, emocion, confianza, estado_derivado, capturado_en) VALUES
                (${A1}, ${s}, 'CALM', 90, 'neutral', now() - interval '181 days'),
                (${A1}, ${s}, 'CALM', 90, 'neutral', now() - interval '179 days')`;
            const [{ n }] = await tx`SELECT fn_purgar_eventos_emocionales() AS n`;
            expect(n).toBe(1);
        }));

    it("anonimiza PII, borra notas y eventos y conserva intentos", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const s = await crearSesion(tx, A1);
            const ej = await crearEjercicio(tx);
            const [{ id: p }] = await tx`INSERT INTO practica_libre (alumno_id, juego, tema_id) VALUES (${A1}, 'arrastrar', ${IDS.temaSuma}) RETURNING id`;
            await tx`INSERT INTO intento_ejercicio (practica_id, alumno_id, ejercicio_id, nivel, respuesta, correcta, numero_intento, tiempo_ms, cliente_id)
                     VALUES (${p}, ${A1}, ${ej}, 2, '{}', true, 1, 10, gen_random_uuid())`;
            await tx`INSERT INTO nota_docente (docente_id, alumno_id, texto) VALUES (${IDS.docenteA}, ${A1}, 'nota')`;
            await tx`INSERT INTO evento_emocional (alumno_id, sesion_id, emocion, confianza, estado_derivado) VALUES (${A1}, ${s}, 'SAD', 80, 'frustracion')`;
            await tx`SELECT fn_anonimizar_alumno(${A1})`;
            const [a] = await tx`SELECT nombre, pin_hash FROM alumno WHERE id = ${A1}`;
            expect(a).toEqual({ nombre: "Alumno anonimizado", pin_hash: null });
            const [c] = await tx`SELECT
                (SELECT count(*) FROM nota_docente WHERE alumno_id = ${A1})::int AS notas,
                (SELECT count(*) FROM evento_emocional WHERE alumno_id = ${A1})::int AS eventos,
                (SELECT count(*) FROM intento_ejercicio WHERE alumno_id = ${A1})::int AS intentos`;
            expect(c).toEqual({ notas: 0, eventos: 0, intentos: 1 });
        }));

    it("ninguna columna es binaria (RC-05) y la auditoría es inmutable", () =>
        enTransaccion(async (tx) => {
            const binarias = await tx`SELECT table_name, column_name FROM information_schema.columns
                                      WHERE table_schema = 'public' AND data_type = 'bytea'`;
            expect(binarias).toHaveLength(0);
            await tx`SELECT fn_auditar(NULL, NULL, 'login')`;
            const err = await capturarError(tx, (sp) => sp`DELETE FROM auditoria_acceso`);
            expect(err?.message).toBe("AUDITORIA_INMUTABLE");
        }));
});

describe("fn_generar_retroalimentacion (RF-61)", () => {
    it("se crea solo con PANAS y diagnóstico, con estado inicial y nivel sugerido", () =>
        enTransaccion(async (tx) => {
            await crearFixture(tx);
            const s = await crearSesion(tx, A1);
            await comoApp(tx, "alumno", A1);
            await tx`INSERT INTO panas_resultado (sesion_id, alumno_id, afecto_positivo, afecto_negativo, completado_en)
                     VALUES (${s}, ${A1}, 2.0, 3.4, now())`;
            expect((await tx`SELECT fn_generar_retroalimentacion(${s}) AS id`)[0].id).toBeNull();
            await tx`INSERT INTO diagnostico_mat_resultado (sesion_id, alumno_id, tema_id, aciertos, total, nivel_dominio, tiempo_total_ms)
                     VALUES (${s}, ${A1}, ${IDS.temaResta}, 1, 3, 2, 5000)`;
            expect((await tx`SELECT fn_generar_retroalimentacion(${s}) AS id`)[0].id).not.toBeNull();
            const [r] = await tx`SELECT estado_inicial, nivel_sugerido_por_tema, observaciones FROM retroalimentacion WHERE sesion_id = ${s}`;
            expect(r.estado_inicial).toBe("frustracion");
            expect(r.nivel_sugerido_por_tema).toEqual({ [IDS.temaResta]: 1 });
            expect(r.observaciones).toEqual(["AN alto y dominio bajo en Resta"]);
        }));

    it("tabla de estado inicial desde PANAS-C (§3.2)", () =>
        enTransaccion(async (tx) => {
            const casos: [number, number, string][] = [
                [4, 3, "frustracion"], [4, 2, "positivo"], [2, 2, "desinteres"], [3, 2.6, "neutral"], [3.5, 2.5, "neutral"],
            ];
            for (const [ap, an, esperado] of casos) {
                const [r] = await tx`SELECT fn_estado_inicial(${ap}, ${an}) AS e`;
                expect(r.e, `AP=${ap} AN=${an}`).toBe(esperado);
            }
        }));
});
