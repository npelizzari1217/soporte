import { describe, it, expect } from "vitest";
import { conValorFueraDeCatalogo } from "./opciones-catalogo";

const ACTIVAS = [
  { id: "a", nombre: "Alta" },
  { id: "b", nombre: "Media" },
];

describe("conValorFueraDeCatalogo", () => {
  it("agrega la opción sintética cuando el catálogo resolvió y no trae el valor vigente", () => {
    const resultado = conValorFueraDeCatalogo(ACTIVAS, true, "z", "Prioridad dada de baja");

    expect(resultado).toHaveLength(3);
    expect(resultado[2]).toEqual({ id: "z", nombre: "Prioridad dada de baja" });
  });

  it("hermano invertido: si el valor vigente ESTÁ en el catálogo, devuelve la lista intacta", () => {
    const resultado = conValorFueraDeCatalogo(ACTIVAS, true, "a", "Prioridad dada de baja");

    expect(resultado).toBe(ACTIVAS);
  });

  // El corazón del helper: la AUSENCIA solo prueba una baja cuando la lista YA
  // resolvió. Con el catálogo cargando o caído la lista llega vacía, y etiquetar
  // ahí sería mentir sobre un valor que sigue activo.
  it.each([
    ["catálogo sin resolver, lista vacía", [] as typeof ACTIVAS],
    ["catálogo sin resolver, con datos viejos", ACTIVAS],
  ])("%s: NO agrega nada", (_nombre, opciones) => {
    const resultado = conValorFueraDeCatalogo(opciones, false, "z", "Prioridad dada de baja");

    expect(resultado).toBe(opciones);
  });

  it("no agrega una opción con id vacío: 'sin valor' no es 'valor dado de baja'", () => {
    const resultado = conValorFueraDeCatalogo(ACTIVAS, true, "", "Prioridad dada de baja");

    expect(resultado).toBe(ACTIVAS);
  });

  it("no muta el array que recibe", () => {
    const original = [...ACTIVAS];
    conValorFueraDeCatalogo(original, true, "z", "Prioridad dada de baja");

    expect(original).toHaveLength(2);
  });
});
