import { describe, it, expect } from "vitest";
import { formatearDuracionHabil } from "./duracion-habil";

describe("formatearDuracionHabil", () => {
  it.each([
    { segundos: 0, texto: "0:00" },
    { segundos: 59, texto: "0:01" },
    { segundos: 29, texto: "0:00" },
    { segundos: 7500, texto: "2:05" },
    { segundos: 3599, texto: "1:00" },
    { segundos: 108_000, texto: "30:00" },
  ])("$segundos s → '$texto'", ({ segundos, texto }) => {
    expect(formatearDuracionHabil(segundos)).toBe(texto);
  });
});
