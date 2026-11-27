// P-INT-01, P-SEC-03 (sin imágenes), oferta de ayuda (RF-27 del alumno) y RC-04 (topes en BD) de EXP-05.
// Sin alertas al docente (migración 0015). Con consentimiento del tutor la cámara procesa para todos (A-41).
import { afterEach, describe, expect, it } from "vitest";
import { procesarFrame } from "../../apps/api/src/modules/alumno/emociones";
import { usarGatewayEmociones, type EmotionGateway, type Lectura } from "../../apps/api/src/infra/emociones";
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
        const r = await procesarFrame({ rol: "alumno", id: e.alumnos[0] }, img, e.asignacionDe(e.alumnos[0]), 0);
        expect(r).toEqual({ procesado: true, ofrecerAyuda: null });
        expect(JSON.stringify(r)).not.toContain("HAPPY");
        expect([...img].every((b) => b === 0)).toBe(true);
        const ev = await sql`SELECT emocion, confianza, estado_derivado, asignacion_id FROM evento_emocional WHERE alumno_id = ${e.alumnos[0]}`;
        expect(ev).toEqual([{ emocion: "HAPPY", confianza: "91.50", estado_derivado: "positivo", asignacion_id: e.asignacionDe(e.alumnos[0]) }]);
        // Ninguna columna de la BD puede contener bytes de imagen
        expect(await sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bytea'`).toEqual([]);
    });

    it("sin proveedor configurado no procesa ni guarda nada", async () => {
        const e = await escenarioCompleto();
        usarGatewayEmociones(null);
        const img = jpeg();
        expect(await procesarFrame({ rol: "alumno", id: e.alumnos[0] }, img, null, 0)).toEqual({ procesado: false, motivo: "desactivado" });
        expect([...img].every((b) => b === 0)).toBe(true);
        expect(await sql`SELECT id FROM evento_emocional WHERE alumno_id = ${e.alumnos[0]}`).toHaveLength(0);
    });

    it("tope por alumno en BD: 1 fotograma por intervalo y máximo diario", async () => {
        const e = await escenarioCompleto();
        usarGatewayEmociones(gateway({ emocion: "CALM", confianza: 80 }));
        const ctx = { rol: "alumno" as const, id: e.alumnos[0] };
        expect((await procesarFrame(ctx, jpeg(), null, 0)).procesado).toBe(true);
        expect(await procesarFrame(ctx, jpeg(), null, 0)).toEqual({ procesado: false, motivo: "frecuencia" });
        await sinIntervalo();
        await sql`UPDATE config_adaptativa SET valor = '2' WHERE clave = 'rekognition_tope_diario'`;
        try {
            expect((await procesarFrame(ctx, jpeg(), null, 0)).procesado).toBe(true);
            expect(await procesarFrame(ctx, jpeg(), null, 0)).toEqual({ procesado: false, motivo: "tope" });
        } finally {
            await sql`UPDATE config_adaptativa SET valor = '400' WHERE clave = 'rekognition_tope_diario'`;
            await sql`UPDATE config_adaptativa SET valor = '5' WHERE clave = 'rekognition_intervalo_seg'`;
        }
    });
});

describe("oferta de ayuda al alumno (RF-27, EXP-05.4)", () => {
    it("IF alto en 2 evaluaciones seguidas pregunta al alumno si quiere ayuda, sin crear alertas; luego enfría", async () => {
        const e = await escenarioCompleto({ num: 10 });
        await sinIntervalo();
        try {
            usarGatewayEmociones(gateway({ emocion: "ANGRY", confianza: 95 }));
            const ctx = { rol: "alumno" as const, id: e.alumnos[0] };
            const asig = e.asignacionDe(e.alumnos[0]);
            // Dos errores seguidos + emoción de frustración + inactividad: IF ≥ 0.6
            const intentos = [await responderActividad(e, false), await responderActividad(e, false)];
            const f1 = await procesarFrame(ctx, jpeg(), asig, 50);
            const f2 = await procesarFrame(ctx, jpeg(), asig, 55);
            // La 2.ª evaluación alta (la del 2.º intento o la de un fotograma) hace la pregunta
            const ofertas = [...intentos.map((r) => r.ofrecerAyuda), ...[f1, f2].map((f) => (f.procesado ? f.ofrecerAyuda : null))].filter(Boolean);
            expect(ofertas).toEqual([{ mensaje: "¿Quieres que te ayude? Vamos paso a paso." }]);
            const [{ ultima }] = await sql`SELECT ultima_oferta_ayuda AS ultima FROM asignacion_alumno WHERE id = ${asig}`;
            expect(ultima).not.toBeNull();

            // Enfriamiento (cooldown_alerta_min = 5): no se vuelve a preguntar enseguida
            const f3 = await procesarFrame(ctx, jpeg(), asig, 60);
            const f4 = await procesarFrame(ctx, jpeg(), asig, 60);
            expect([f3, f4].every((f) => f.procesado && f.ofrecerAyuda === null)).toBe(true);
        } finally {
            await sql`UPDATE config_adaptativa SET valor = '5' WHERE clave = 'rekognition_intervalo_seg'`;
        }
    });
});
