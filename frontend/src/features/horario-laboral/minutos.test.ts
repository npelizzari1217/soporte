import { describe, expect, it } from "vitest";
import { hhmmAMinutos, minutosAHhmm } from "./minutos";

describe("minutosAHhmm / hhmmAMinutos — ida y vuelta", () => {
  it("540 (09:00) ida y vuelta en apertura", () => {
    const hhmm = minutosAHhmm(540, false);
    expect(hhmm).toBe("09:00");
    expect(hhmmAMinutos(hhmm, false)).toBe(540);
  });

  it("1080 (18:00) ida y vuelta en cierre", () => {
    const hhmm = minutosAHhmm(1080, true);
    expect(hhmm).toBe("18:00");
    expect(hhmmAMinutos(hhmm, true)).toBe(1080);
  });

  it("0 (medianoche de inicio) ida y vuelta en apertura", () => {
    const hhmm = minutosAHhmm(0, false);
    expect(hhmm).toBe("00:00");
    expect(hhmmAMinutos(hhmm, false)).toBe(0);
  });

  it("caso 00:00 en cierre: 1440 (fin del día) ida y vuelta", () => {
    const hhmm = minutosAHhmm(1440, true);
    expect(hhmm).toBe("00:00");
    expect(hhmmAMinutos(hhmm, true)).toBe(1440);
  });

  it("caso 00:00 en apertura: sigue significando 0, nunca 1440", () => {
    expect(hhmmAMinutos("00:00", false)).toBe(0);
  });

  it("minuto con un solo dígito se rellena con cero", () => {
    expect(minutosAHhmm(65, false)).toBe("01:05");
    expect(hhmmAMinutos("01:05", false)).toBe(65);
  });
});
