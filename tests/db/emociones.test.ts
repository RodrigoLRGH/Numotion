// P-INT-01, P-SEC-03 (sin imágenes), P-API-07 (alertas) y RC-04 (topes en BD) de EXP-05.
import { afterEach, describe, expect, it } from "vitest";
import { procesarFrame, responderAlerta } from "../../apps/api/src/modules/alumno/emociones";
import { usarGatewayEmociones, type EmotionGateway, type Lectura } from "../../apps/api/src/infra/emociones";
import { alertas, atenderAlerta, guia } from "../../apps/api/src/modules/docente/alertas";
import { escenarioCompleto, responderActividad } from "./escenario";
import { sql } from "./fixture";

function gateway(lectura: Lectura): EmotionGateway & { vistos: Uint8Array[] } {
    const vistos: Uint8Array[] = [];
    return { nombre: "simulado", vistos, async detectar(img) { vistos.push(img); return lectura; } };
}

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);

afterEach(async () => {
    usarGatewayEmociones(undefined);
    await sql`UPDATE config_adaptativa SET valor = '5' WHERE clave = 'rekognition_intervalo_seg'`;
    await sql`UPDATE config_adaptativa SET valor = '400' WHERE clave = 'rekognition_tope_diario'`;
});

async function sinIntervalo() {
    await sql`UPDATE config_adaptativa SET valor = '0' WHERE clave = 'rekognition_intervalo_seg'`;
}

describe("fotogramas (EXP-05.1, EXP-05.2)", () => {
    it("guarda solo emoción, confianza y estado derivado; descarta el buffer; no devuelve la emoción", async () => {
        const e = await escenarioCompleto();
        await sinIntervalo();
        const g = gateway({ emocion: "HAPPY", confianza: 91.5 });
        usarGatewayEmociones(g);
        const img = jpeg();
        const r = await procesarFrame({ rol: "alumno", id: e.alumnos[0] }, true, img, e.asignacionDe(e.alumnos[0]), 0);
        expect(r).toEqual({ procesado: true, ofrecerAyuda: null });
        expect(JSON.stringify(r)).not.toContain("HAPPY");
        expect([...img].every((b) => b === 0)).toBe(true);
        const ev = await sql`SELECT emocion, confianza, estado_derivado, asignacion_id FROM evento_emocional WHERE alumno_id = ${e.alumnos[0]}`;
        expect(ev).toEqual([{ emocion: "HAPPY", confianza: "91.50", estado_derivado: "positivo", asignacion_id: e.asignacionDe(e.alumnos[0]) }]);
        // Ninguna columna de la BD puede contener bytes de imagen
        expect(await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bytea'`).toEqual([]);
    });

    it("sin consentimiento de cámara no procesa ni llama al proveedor", async () => {
        const e = await escenarioCompleto({ camara: false });
        const g = gateway({ emocion: "SAD", confianza: 99 });
        usarGatewayEmociones(g);
        const r = await procesarFrame({ rol: "alumno", id: e.alumnos[0] }, false, jpeg(), null, 0);
        expect(r).toEqual({ procesado: false, motivo: "sin_consentimiento" });
        expect(g.vistos).toHaveLength(0);
    });

    it("tope por alumno en BD: 1 fotograma por intervalo y máximo diario", async () => {
        const e = await escenarioCompleto();
        usarGatewayEmociones(gateway({ emocion: "CALM", confianza: 80 }));
        const ctx = { rol: "alumno" as const, id: e.alumnos[0] };
        expect((await procesarFrame(ctx, true, jpeg(), null, 0)).procesado).toBe(true);
        expect(await procesarFrame(ctx, true, jpeg(), null, 0)).toEqual({ procesado: false, motivo: "frecuencia" });
        await sinIntervalo();
        await sql`UPDATE config_adaptativa SET valor = '2' WHERE clave = 'rekognition_tope_diario'`;
        try {
            expect((await procesarFrame(ctx, true, jpeg(), null, 0)).procesado).toBe(true);
            expect(await procesarFrame(ctx, true, jpeg(), null, 0)).toEqual({ procesado: false, motivo: "tope" });
        } finally {
            await sql`UPDATE config_adaptativa SET valor = '400' WHERE clave = 'rekognition_tope_diario'`;
            await sql`UPDATE config_adaptativa SET valor = '5' WHERE clave = 'rekognition_intervalo_seg'`;
        }
    });
});

describe("alerta temprana y guía (EXP-05.5, EXP-05.6)", () => {
    it("IF alto en 2 evaluaciones seguidas crea UNA alerta para el docente del grupo con guía; luego enfría", async () => {
        const e = await escenarioCompleto({ num: 10 });
        await sinIntervalo();
        try {
            usarGatewayEmociones(gateway({ emocion: "ANGRY", confianza: 95 }));
            const ctx = { rol: "alumno" as const, id: e.alumnos[0] };
            const asig = e.asignacionDe(e.alumnos[0]);
            // Dos errores seguidos + emoción de frustración + inactividad: IF ≥ 0.6
            await responderActividad(e, false);
            await responderActividad(e, false);
            const f1 = await procesarFrame(ctx, true, jpeg(), asig, 50);
            const f2 = await procesarFrame(ctx, true, jpeg(), asig, 55);
            const ofertas = [f1, f2].map((f) => (f.procesado ? f.ofrecerAyuda : null));
            // La 2.ª evaluación alta (puede ser la del 2.º intento o la del 1.er fotograma) crea la alerta
            const alerta = ofertas.find(Boolean) ?? null;
            expect(alerta).not.toBeNull();
            const f3 = await procesarFrame(ctx, true, jpeg(), asig, 60);
            const f4 = await procesarFrame(ctx, true, jpeg(), asig, 60);
            expect([f3, f4].every((f) => f.procesado && f.ofrecerAyuda === null)).toBe(true); // enfriamiento 5 min

            const lista = await e.comoDocente((tx) => alertas(tx, { pendientes: true }));
            expect(lista).toHaveLength(1);
            expect(lista[0]).toMatchObject({ alumno: { id: e.alumnos[0] }, actividad: "Actividad escenario", tema: "Suma" });
            expect(lista[0].indice).toBeGreaterThanOrEqual(0.6);
            expect(lista[0].senales.descripcion?.join(" ")).toMatch(/errores? seguidos/);
            const g = await e.comoDocente((tx) => guia(tx, lista[0].guia!.id));
            expect(g?.pasos.length).toBeGreaterThanOrEqual(3);

            // El alumno acepta ayuda → R2 al cerrar el siguiente ejercicio
            expect(await e.comoAlumno((tx) => responderAlerta(tx, e.alumnos[0], alerta!.alertaId, true))).toBe(true);
            const [{ nivel_actual: antes }] = await sql`SELECT nivel_actual FROM asignacion_alumno WHERE id = ${asig}`;
            usarGatewayEmociones(gateway({ emocion: "CALM", confianza: 95 }));
            const r = await responderActividad(e, true);
            if (antes > 1) expect(r.nivel).toMatchObject({ anterior: antes, actual: antes - 1, motivo: "solicitud_ayuda" });

            // El docente atiende con nota → nota "emocional"
            expect(await e.comoDocente((tx) => atenderAlerta(tx, e.docenteId, lista[0].alertaId, "Le expliqué el primer paso"))).toBe(true);
            expect(await e.comoDocente((tx) => alertas(tx, { pendientes: true }))).toEqual([]);
            const notas = await sql`SELECT texto, etiqueta FROM nota_docente WHERE alumno_id = ${e.alumnos[0]}`;
            expect(notas).toEqual([{ texto: "Le expliqué el primer paso", etiqueta: "emocional" }]);
        } finally {
            await sql`UPDATE config_adaptativa SET valor = '5' WHERE clave = 'rekognition_intervalo_seg'`;
        }
    });

    it("otro docente no ve la alerta ni puede atenderla", async () => {
        const e = await escenarioCompleto();
        const otro = await escenarioCompleto();
        const [a] = await sql`INSERT INTO alerta (alumno_id, docente_id, asignacion_id, indice) VALUES (${e.alumnos[0]}, ${e.docenteId}, ${e.asignacionDe(e.alumnos[0])}, 0.7) RETURNING id`;
        expect(await otro.comoDocente((tx) => alertas(tx, { pendientes: true }))).toEqual([]);
        expect(await otro.comoDocente((tx) => atenderAlerta(tx, otro.docenteId, a.id))).toBe(false);
        // Y el alumno de otro grupo no puede responderla
        expect(await otro.comoAlumno((tx) => responderAlerta(tx, otro.alumnos[0], a.id, true), otro.alumnos[0])).toBe(false);
    });
});
