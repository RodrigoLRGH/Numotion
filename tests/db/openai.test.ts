// P-INT-02 (con BD) · T-03-04-20: historias de OpenAI en el motor. Caché por (tema, tipo, nivel,
// interés), respaldo de catálogo ante fallos, propuesta obsoleta descartada y presupuesto mensual.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { registrarDocente } from "../../apps/api/src/modules/core/auth";
import { conContexto, type Contexto } from "../../apps/api/src/infra/db";
import { configOpenAI, type ConfigOpenAI } from "../../apps/api/src/infra/openai";
import { crearAlumno, crearGrupo } from "../../apps/api/src/modules/docente/grupos";
import { crearActividad } from "../../apps/api/src/modules/docente/actividades";
import { presupuestoBd, servirEjercicio } from "../../apps/api/src/modules/alumno/contenido";
import { planHistoria, registrarIntento, siguienteEjercicio, type Siguiente } from "../../apps/api/src/modules/alumno/motor";
import { sql } from "./fixture";

const real = (extra: Partial<ConfigOpenAI> = {}): ConfigOpenAI => ({
    ...configOpenAI({ OPENAI_ENABLED: "true", OPENAI_API_KEY: "sk-prueba", OPENAI_BASE_URL: "https://stub.local/v1", OPENAI_MONTHLY_BUDGET_USD: "1000" }),
    ...extra,
});
const mock = () => configOpenAI({ OPENAI_ENABLED: "true", OPENAI_MODE: "mock" });

/** OpenAI simulado: cuenta la historia con los números que le pidieron. */
function stubOpenAI() {
    return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const pedido = JSON.parse(JSON.parse(init!.body as string).messages[1].content) as { numeros: [number, number] };
        const [a, b] = pedido.numeros;
        const contenido = JSON.stringify({ historia: `En la granja hay ${a} gallinas y llegan ${b} gallinas más.`, pregunta: "¿Cuántas gallinas hay ahora?" });
        return new Response(JSON.stringify({ choices: [{ message: { content: contenido } }], usage: { prompt_tokens: 150, completion_tokens: 40 } }), { status: 200 });
    });
}

async function escenario(opciones: { alumnos?: number; intereses?: string[]; tipo?: string } = {}) {
    await sql`INSERT INTO aviso_privacidad (version, vigente_desde, url) VALUES ('v1', now() - interval '1 day', '/privacidad') ON CONFLICT DO NOTHING`;
    const { docente } = await registrarDocente("Docente OpenAI", `openai-${randomUUID()}@escuela.mx`, "contraseña-segura");
    const ctxD: Contexto = { rol: "docente", id: docente.id };
    const grupo = await conContexto(ctxD, (tx) => crearGrupo(tx, docente.id, { nombre: "3O", grado: 3, cicloEscolar: "2026-2027" }));
    const alumnos: string[] = [];
    for (let i = 0; i < (opciones.alumnos ?? 1); i++) {
        const r = await conContexto(ctxD, (tx) =>
            crearAlumno(tx, grupo.id, { nombre: `Ana${i}`, apellidos: "Pérez", tutorNombre: "T", tutorEmail: "t@c.mx", intereses: opciones.intereses }),
        );
        if (!r.ok) throw new Error(r.message);
        alumnos.push(r.alumno.id);
    }
    // Tema propio por escenario no es posible (catálogo fijo): se aísla la caché con un interés único
    const [{ id: temaId }] = await sql`SELECT id FROM tema WHERE clave = 'suma'`;
    const [{ hoy }] = await sql`SELECT to_char(fn_hoy_local(), 'YYYY-MM-DD') AS hoy`;
    const act = await conContexto(ctxD, (tx) =>
        crearActividad(tx, docente.id, {
            nombre: "Sumas con historia", temaId, tipoInteraccion: (opciones.tipo ?? "seleccion_multiple") as "seleccion_multiple",
            fechaAsignacion: hoy, numEjercicios: 3, destino: { tipo: "grupo", grupoId: grupo.id },
        }),
    );
    if (!act.ok) throw new Error(act.message);
    const asignaciones = await sql<{ id: string; alumno_id: string }[]>`SELECT id, alumno_id FROM asignacion_alumno WHERE actividad_id = ${act.actividadId}`;
    const asignacion = (alumno: string) => asignaciones.find((s) => s.alumno_id === alumno)!.id;
    const ctx = (alumno: string) => ({ rol: "alumno" as const, id: alumno });
    return { alumnos, asignacion, ctx };
}

const ejercicioDe = (s: Siguiente) => {
    if (!("ejercicio" in s)) throw new Error(JSON.stringify(s));
    return s.ejercicio;
};
const filaEjercicio = async (id: string) => (await sql`SELECT origen, respuesta, pasos_solucion FROM ejercicio WHERE id = ${id}`)[0];

describe("historias en el motor (EXP-04.7)", () => {
    it("con OpenAI activo el ejercicio nuevo es una historia; respuesta y validación no cambian", async () => {
        const e = await escenario({ intereses: ["Gatos"] });
        const [alumno] = e.alumnos;
        const fetchFn = stubOpenAI();
        const ej = ejercicioDe(await servirEjercicio(e.ctx(alumno), e.asignacion(alumno), true, { cfg: real(), fetchFn: fetchFn as typeof fetch }));
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(ej.enunciado).toMatch(/^En la granja hay \d+ gallinas y llegan \d+ gallinas más\. ¿Cuántas gallinas hay ahora\?$/);
        // P-INT-02: nada del alumno en la petición (nombre, apellidos, ids)
        const cuerpo = fetchFn.mock.calls[0][1]!.body as string;
        for (const dato of ["Ana0", "Pérez", alumno, e.asignacion(alumno)]) expect(cuerpo).not.toContain(dato);
        expect(JSON.parse(JSON.parse(cuerpo).messages[1].content).tema).toBe("los gatos");

        const fila = await filaEjercicio(ej.id);
        expect(fila.origen).toBe("openai");
        expect(fila.respuesta.contexto).toBe("los gatos");
        expect(Number(fila.respuesta.valor)).toBe(fila.respuesta.datos.a + fila.respuesta.datos.b);
        expect(fila.pasos_solucion[0].texto).toContain("Piensa qué operación pide la historia");
        expect(ej.opciones).toContain(fila.respuesta.valor);

        // Retomar no vuelve a llamar a OpenAI
        const otraVez = ejercicioDe(await servirEjercicio(e.ctx(alumno), e.asignacion(alumno), false, { cfg: real(), fetchFn: fetchFn as typeof fetch }));
        expect(otraVez.id).toBe(ej.id);
        expect(fetchFn).toHaveBeenCalledTimes(1);

        const r = await conContexto(e.ctx(alumno), (tx) =>
            registrarIntento(tx, alumno, { clienteId: randomUUID(), asignacionId: e.asignacion(alumno), ejercicioId: ej.id, respuesta: fila.respuesta.valor, tiempoMs: 4000, ayudaSolicitada: false }),
        );
        expect(r).toMatchObject({ correcta: true, puntos: 10 });
    });

    it("caché: otro alumno con el mismo tema, tipo, nivel e interés reutiliza la historia sin llamar a OpenAI", async () => {
        const interes = "Dinosaurios";
        const e = await escenario({ alumnos: 2, intereses: [interes] });
        const [uno, dos] = e.alumnos;
        // Se vacía la caché de este interés para no depender de otras pruebas
        await sql`UPDATE ejercicio SET activo = false WHERE origen = 'openai' AND respuesta->>'contexto' = 'los dinosaurios'`;
        const fetchFn = stubOpenAI();
        const deps = { cfg: real(), fetchFn: fetchFn as typeof fetch };
        const primero = ejercicioDe(await servirEjercicio(e.ctx(uno), e.asignacion(uno), true, deps));
        const segundo = ejercicioDe(await servirEjercicio(e.ctx(dos), e.asignacion(dos), true, deps));
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(segundo.id).toBe(primero.id);

        // El mismo alumno no recibe dos veces la misma historia en su asignación
        const fila = await filaEjercicio(primero.id);
        await conContexto(e.ctx(uno), (tx) =>
            registrarIntento(tx, uno, { clienteId: randomUUID(), asignacionId: e.asignacion(uno), ejercicioId: primero.id, respuesta: fila.respuesta.valor, tiempoMs: 4000, ayudaSolicitada: false }),
        );
        const plan = await conContexto(e.ctx(uno), (tx) => planHistoria(tx, uno, e.asignacion(uno)));
        expect(plan && "reusarId" in plan ? plan.reusarId : null).not.toBe(primero.id);
    });

    it("respaldo de catálogo: si OpenAI falla, el ejercicio es el del generador", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const e = await escenario({ intereses: ["Robots"] });
        const [alumno] = e.alumnos;
        await sql`UPDATE ejercicio SET activo = false WHERE origen = 'openai' AND respuesta->>'contexto' = 'los robots'`;
        const fallo = (async () => new Response("{}", { status: 500 })) as typeof fetch;
        const ej = ejercicioDe(await servirEjercicio(e.ctx(alumno), e.asignacion(alumno), true, { cfg: real(), fetchFn: fallo }));
        expect(ej.enunciado).toMatch(/^¿Cuánto es \d+ \+ \d+\?$/);
        expect((await filaEjercicio(ej.id)).origen).toBe("generador");
        vi.restoreAllMocks();
    });

    it("apagado: no hay plan ni llamadas (el motor de siempre)", async () => {
        const e = await escenario();
        const [alumno] = e.alumnos;
        const fetchFn = vi.fn();
        const ej = ejercicioDe(await servirEjercicio(e.ctx(alumno), e.asignacion(alumno), true, { cfg: configOpenAI({}), fetchFn: fetchFn as unknown as typeof fetch }));
        expect(fetchFn).not.toHaveBeenCalled();
        expect((await filaEjercicio(ej.id)).origen).toBe("generador");
    });

    it("modo mock en arrastrar: historia y expresión con hueco", async () => {
        const e = await escenario({ tipo: "arrastrar", intereses: ["Espacio"] });
        const [alumno] = e.alumnos;
        await sql`UPDATE ejercicio SET activo = false WHERE origen = 'openai' AND respuesta->>'contexto' = 'el espacio'`;
        const ej = ejercicioDe(await servirEjercicio(e.ctx(alumno), e.asignacion(alumno), true, { cfg: mock() }));
        expect(ej.enunciado).toContain("sobre el espacio");
        expect(ej.expresion).toMatch(/^\d+ \+ \d+ = □$/);
        expect((await filaEjercicio(ej.id)).origen).toBe("openai");
    });

    it("una propuesta preparada para otro momento (presentados distinto) se descarta", async () => {
        const e = await escenario();
        const [alumno] = e.alumnos;
        const plan = await conContexto(e.ctx(alumno), (tx) => planHistoria(tx, alumno, e.asignacion(alumno)));
        if (!plan || "reusarId" in plan) throw new Error("se esperaba un pedido");
        const ejercicio = { ...plan.ejercicio, enunciado: "Historia vieja con 1 y 2." };
        const s = await conContexto(e.ctx(alumno), (tx) =>
            siguienteEjercicio(tx, alumno, e.asignacion(alumno), { nivel: plan.nivel, presentados: plan.presentados + 1, ejercicio, contexto: "x" }),
        );
        expect(ejercicioDe(s).enunciado).not.toContain("Historia vieja");
    });
});

describe("presupuesto mensual (uso_openai)", () => {
    it("reserva solo si cabe en el límite, ajusta al costo real y no es accesible directamente", async () => {
        const e = await escenario();
        const ctx = e.ctx(e.alumnos[0]);
        const p = presupuestoBd(ctx);
        const gastado = async () => Number((await sql`SELECT coalesce(sum(costo_usd), 0) AS c FROM uso_openai WHERE mes = date_trunc('month', fn_hoy_local())::date`)[0].c);
        const base = await gastado();
        expect(await p.reservar(0.25, base + 0.5)).toBe(true);
        expect(await p.reservar(0.3, base + 0.5)).toBe(false);
        await p.ajustar(-0.2);
        expect(await gastado()).toBeCloseTo(base + 0.05, 6);
        expect(await p.reservar(0.3, base + 0.5)).toBe(true);

        // La app no puede leer ni escribir la tabla, y el docente no puede reservar
        await expect(conContexto(ctx, (tx) => tx.$queryRaw`SELECT * FROM uso_openai`)).rejects.toThrow();
        const [{ id: docente }] = await sql`SELECT id FROM docente LIMIT 1`;
        await expect(conContexto({ rol: "docente", id: docente }, (tx) => tx.$queryRaw`SELECT fn_openai_reservar(0.1, 100) AS ok`)).rejects.toThrow();
    });
});
