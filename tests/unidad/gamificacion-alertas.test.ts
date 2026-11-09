// P-UNIT-09 (insignias, nivel), P-UNIT-12 (mensaje motivacional), P-UNIT-07 (estado por fotograma)
// y P-UNIT-02 (alerta: 2 evaluaciones seguidas y enfriamiento).
import { describe, expect, it } from "vitest";
import { derivarEstado, describirSenales, erroresConsecutivos, evaluarAlerta, fraccionFrustracion } from "@numotion/core/dominio/alertas";
import { aciertosTrasAyuda, evaluarInsignias, type ContextoGamificacion, type InsigniaCatalogo } from "@numotion/core/dominio/insignias";
import { elegirMensaje, sustituir, type MensajeCatalogo } from "@numotion/core/dominio/mensajes";
import { personajeDe, progresoNivel, semanaHabil } from "@numotion/core/dominio/personaje";
import { lecturaDeRespuesta } from "../../apps/api/src/infra/emociones";

const base: ContextoGamificacion = { asignacionesCompletadas: 0, rachaActual: 0, practicasCompletadas: 0, tiposJuegoDistintos: 0, aciertosTrasAyuda: 0, resultadosPorTema: {} };
const catalogo: InsigniaCatalogo[] = [
    { clave: "primera_actividad", regla: { tipo: "asignaciones_completadas", min: 1 } },
    { clave: "racha_5", regla: { tipo: "racha", min: 5 } },
    { clave: "constante", regla: { tipo: "practicas_completadas", min: 20 } },
    { clave: "explorador", regla: { tipo: "tipos_juego_distintos", min: 4 } },
    { clave: "valiente", regla: { tipo: "ayuda_y_aciertos_seguidos", aciertos: 3 } },
    { clave: "maestro_suma", regla: { tipo: "maestria_tema", temaClave: "suma", asignaciones: 5, resultadoMin: 8 } },
];

describe("insignias (P-UNIT-09)", () => {
    it("cada regla del catálogo y nunca repite las obtenidas", () => {
        expect(evaluarInsignias(base, catalogo)).toEqual([]);
        expect(evaluarInsignias({ ...base, asignacionesCompletadas: 1, rachaActual: 5 }, catalogo)).toEqual(["primera_actividad", "racha_5"]);
        expect(evaluarInsignias({ ...base, asignacionesCompletadas: 3 }, catalogo, ["primera_actividad"])).toEqual([]);
        expect(evaluarInsignias({ ...base, practicasCompletadas: 20, tiposJuegoDistintos: 4, aciertosTrasAyuda: 3 }, catalogo)).toEqual(["constante", "explorador", "valiente"]);
        expect(evaluarInsignias({ ...base, resultadosPorTema: { suma: [8, 9, 10, 8, 7] } }, catalogo)).toEqual([]);
        expect(evaluarInsignias({ ...base, resultadosPorTema: { suma: [8, 9, 10, 8, 8.5] } }, catalogo)).toEqual(["maestro_suma"]);
    });

    it("ignora reglas desconocidas o mal formadas", () => {
        expect(evaluarInsignias(base, [{ clave: "x", regla: { tipo: "otra" } as never }, { clave: "y", regla: null as never }])).toEqual([]);
    });

    it("valiente: aciertos seguidos justo después de un ejercicio con ayuda", () => {
        const c = (ayuda: boolean, correcto: boolean) => ({ ayuda, correcto });
        expect(aciertosTrasAyuda([c(false, true), c(false, true), c(false, true)])).toBe(0);
        expect(aciertosTrasAyuda([c(true, true), c(false, true), c(false, true), c(false, true)])).toBe(3);
        expect(aciertosTrasAyuda([c(true, true), c(false, true), c(false, false), c(false, true), c(false, true)])).toBe(1);
    });
});

describe("personaje y nivel", () => {
    it("accesorio por nivel y barra de progreso (50·n·(n−1))", () => {
        expect(personajeDe("zorro", 1)).toMatchObject({ emoji: "🦊", accesorios: [], accesorioActual: null });
        expect(personajeDe("zorro", 3).accesorios.map((a) => a.nivel)).toEqual([2, 3]);
        expect(progresoNivel(200, 2)).toEqual({ nivel: 2, puntos: 200, puntosNivel: 100, puntosSiguienteNivel: 300, porcentaje: 50 });
        expect(progresoNivel(99999, 20).puntosSiguienteNivel).toBeNull();
    });

    it("semana L–V: de lunes a viernes la actual; en fin de semana la que terminó", () => {
        expect(semanaHabil("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
        expect(semanaHabil("2026-11-08")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
        expect(semanaHabil("2026-11-09")[0]).toBe("2026-11-09");
    });
});

describe("mensaje motivacional (P-UNIT-12)", () => {
    const cat: MensajeCatalogo[] = [
        { id: "a", texto: "Hola {nombre}", condicion: {} },
        { id: "b", texto: "Vamos {nombre}", condicion: {} },
        { id: "c", texto: "{nombre}, llevas {racha} días", condicion: { rachaMin: 2 } },
        { id: "d", texto: "Con calma, {nombre}", condicion: { estadoInicial: ["frustracion"] } },
        { id: "e", texto: "Nueva racha, {nombre}", condicion: { rachaMax: 0 } },
    ];
    const ctx = { nombre: "Ana López", racha: 0, estadoInicial: null, fecha: "2026-11-04" };

    it("sustituye {nombre} (primer nombre) y {racha}", () => {
        expect(sustituir("¡{nombre}! {racha} días", { nombre: "Ana López", racha: 3 })).toBe("¡Ana! 3 días");
    });

    it("prefiere el más específico según estado y racha", () => {
        expect(elegirMensaje(cat, { ...ctx, estadoInicial: "frustracion" }, null)?.id).toBe("d");
        expect(elegirMensaje(cat, { ...ctx, racha: 4 }, null)?.texto).toBe("Ana, llevas 4 días");
        expect(elegirMensaje(cat, ctx, null)?.id).toBe("e");
    });

    it("estable en el día y sin repetir el de ayer", () => {
        const solo = cat.slice(0, 2);
        const hoy = elegirMensaje(solo, ctx, { id: "a", fecha: "2026-11-04" });
        expect(hoy?.id).toBe("a");
        expect(elegirMensaje(solo, ctx, { id: "a", fecha: "2026-11-03" })?.id).toBe("b");
        expect(elegirMensaje(solo, ctx, { id: "b", fecha: "2026-11-03" })?.id).toBe("a");
        expect(elegirMensaje([], ctx, null)).toBeNull();
    });
});

describe("emoción por fotograma y alerta (P-UNIT-07, P-UNIT-02)", () => {
    it("tabla §3.1", () => {
        expect(derivarEstado("HAPPY", 80)).toBe("positivo");
        expect(derivarEstado("SURPRISED", 60)).toBe("positivo");
        expect(derivarEstado("CALM", 90)).toBe("neutral");
        for (const e of ["CONFUSED", "ANGRY", "SAD", "FEAR", "DISGUSTED"] as const) expect(derivarEstado(e, 75)).toBe("frustracion");
        expect(derivarEstado("ANGRY", 59.9)).toBe("sin_dato");
        expect(derivarEstado("SIN_ROSTRO", 0)).toBe("sin_dato");
    });

    it("E solo con muestras con dato; null sin cámara", () => {
        expect(fraccionFrustracion([])).toBeNull();
        expect(fraccionFrustracion(["sin_dato"])).toBeNull();
        expect(fraccionFrustracion(["frustracion", "neutral", "sin_dato", "frustracion"])).toBeCloseTo(2 / 3);
    });

    it("alerta a la 2.ª evaluación alta seguida, con enfriamiento de 5 min", () => {
        const e = { umbral: 0.6, ultimaAlertaMs: null, ahoraMs: 1_000_000, cooldownMin: 5 };
        expect(evaluarAlerta({ ...e, indice: 0.7, consecutivosPrevios: 0 })).toEqual({ consecutivos: 1, crear: false });
        expect(evaluarAlerta({ ...e, indice: 0.7, consecutivosPrevios: 1 })).toEqual({ consecutivos: 0, crear: true });
        expect(evaluarAlerta({ ...e, indice: 0.5, consecutivosPrevios: 1 })).toEqual({ consecutivos: 0, crear: false });
        expect(evaluarAlerta({ ...e, indice: 0.9, consecutivosPrevios: 1, ultimaAlertaMs: e.ahoraMs - 4 * 60_000 })).toEqual({ consecutivos: 2, crear: false });
        expect(evaluarAlerta({ ...e, indice: 0.9, consecutivosPrevios: 3, ultimaAlertaMs: e.ahoraMs - 6 * 60_000 }).crear).toBe(true);
    });

    it("errores consecutivos y señales en lenguaje de observación", () => {
        expect(erroresConsecutivos([{ correcta: false }, { correcta: false }, { correcta: true }])).toBe(2);
        expect(erroresConsecutivos([{ correcta: false }])).toBe(1);
        expect(describirSenales({ estado: "frustracion", erroresConsecutivos: 3, inactividadSeg: 40 })).toEqual([
            "expresión de frustración en la cámara", "3 errores seguidos", "40 s sin responder",
        ]);
    });

    it("Rekognition: rostro más grande, emoción con mayor confianza; sin rostro = SIN_ROSTRO", () => {
        expect(lecturaDeRespuesta([])).toEqual({ emocion: "SIN_ROSTRO", confianza: 0 });
        expect(lecturaDeRespuesta([
            { BoundingBox: { Width: 0.1 }, Emotions: [{ Type: "SAD", Confidence: 99 }] },
            { BoundingBox: { Width: 0.5 }, Emotions: [{ Type: "CALM", Confidence: 40 }, { Type: "HAPPY", Confidence: 88.123 }] },
        ])).toEqual({ emocion: "HAPPY", confianza: 88.12 });
    });
});
