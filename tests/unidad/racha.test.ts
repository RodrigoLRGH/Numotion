import { describe, expect, it } from "vitest";
import { rachaVigente, registrarActividadLudica, type EstadoRacha } from "@numotion/core/dominio/racha";
import { diaHabilAnterior, esDiaHabil } from "@numotion/core/dominio/fechas";

const vacio: EstadoRacha = { racha_actual: 0, mejor_racha: 0, ultima_fecha_racha: null };

// 2026-10-26 es lunes
describe("fechas", () => {
    it("reconoce fines de semana", () => {
        expect(esDiaHabil("2026-10-24")).toBe(false); // sábado
        expect(esDiaHabil("2026-10-25")).toBe(false); // domingo
        expect(esDiaHabil("2026-10-26")).toBe(true);
    });
    it("el día hábil anterior al lunes es el viernes", () => {
        expect(diaHabilAnterior("2026-10-26")).toBe("2026-10-23");
    });
});

describe("racha (RF-67, RF-68)", () => {
    it("suma 1 la primera actividad del día y no vuelve a sumar el mismo día", () => {
        const a = registrarActividadLudica(vacio, "2026-10-26");
        expect(a.racha_actual).toBe(1);
        expect(registrarActividadLudica(a, "2026-10-26").racha_actual).toBe(1);
    });

    it("días hábiles consecutivos incrementan la racha", () => {
        let e = registrarActividadLudica(vacio, "2026-10-26");
        e = registrarActividadLudica(e, "2026-10-27");
        e = registrarActividadLudica(e, "2026-10-28");
        expect(e.racha_actual).toBe(3);
        expect(e.mejor_racha).toBe(3);
    });

    it("el fin de semana no interrumpe la racha", () => {
        let e = registrarActividadLudica(vacio, "2026-10-22"); // jueves
        e = registrarActividadLudica(e, "2026-10-23"); // viernes
        expect(rachaVigente(e, "2026-10-25")).toBe(2); // domingo
        e = registrarActividadLudica(e, "2026-10-26"); // lunes
        expect(e.racha_actual).toBe(3);
    });

    it("se reinicia a 0 al terminar un día hábil sin actividad y conserva la mejor racha", () => {
        let e = registrarActividadLudica(vacio, "2026-10-26");
        e = registrarActividadLudica(e, "2026-10-27");
        // miércoles 28 sin actividad
        expect(rachaVigente(e, "2026-10-28")).toBe(2); // el día aún no termina
        expect(rachaVigente(e, "2026-10-29")).toBe(0);
        e = registrarActividadLudica(e, "2026-10-29");
        expect(e.racha_actual).toBe(1);
        expect(e.mejor_racha).toBe(2);
    });

    it("actividad en sábado tras viernes cuenta como continuación", () => {
        let e = registrarActividadLudica(vacio, "2026-10-23");
        e = registrarActividadLudica(e, "2026-10-24");
        expect(e.racha_actual).toBe(2);
        expect(rachaVigente(e, "2026-10-26")).toBe(2);
    });
});
