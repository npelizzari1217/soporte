import { describe, it, expect } from "vitest";
import {
  agregarItemCompraSchema,
  cancelarCompraSchema,
  cerrarItemConFaltanteSchema,
  crearCompraSchema,
  editarItemCompraSchema,
  registrarCompraDeItemSchema,
  registrarEntregaDeItemSchema,
} from "./schemas";

/**
 * Estos schemas son espejo de las reglas `class-validator` de `compras.dto.ts`.
 * El valor de tenerlos NO es duplicar la validación — el backend sigue siendo la
 * fuente de verdad — sino dar feedback inmediato. Un schema MÁS LAXO que el
 * backend rompe justamente eso: el form acepta, el servidor rechaza, y el
 * usuario se come un error remoto por algo que se podía ver en el acto.
 *
 * Cada caso de acá es una divergencia real que existía y que el usuario sufría
 * como 400 o 422 en vez de como error de campo.
 */

const ITEM_VALIDO = {
  descripcion: "Insumo",
  cantidad: 2,
  proveedor: "ACME",
  monto: 100,
  moneda: "ARS",
  fechaCotizacion: "2026-01-01",
};

describe("schemas de compras — espejo de las reglas del backend", () => {
  describe("maxDecimalPlaces: 2 (el backend responde 400 si hay más)", () => {
    it.each([
      ["cantidad", { ...ITEM_VALIDO, cantidad: 1.999 }],
      ["monto", { ...ITEM_VALIDO, monto: 10.555 }],
    ])("agregarItemCompra rechaza más de 2 decimales en %s", (_campo, input) => {
      expect(agregarItemCompraSchema.safeParse(input).success).toBe(false);
    });

    it.each([
      ["cantidad", { cantidad: 1.999 }],
      ["monto", { monto: 10.555 }],
    ])("editarItemCompra rechaza más de 2 decimales en %s", (_campo, input) => {
      expect(editarItemCompraSchema.safeParse(input).success).toBe(false);
    });

    it("registrarCompraDeItem rechaza más de 2 decimales", () => {
      expect(registrarCompraDeItemSchema.safeParse({ cantidadComprada: 3.001 }).success).toBe(false);
    });

    it("registrarEntregaDeItem rechaza más de 2 decimales", () => {
      expect(registrarEntregaDeItemSchema.safeParse({ cantidadEntregada: 3.001 }).success).toBe(false);
    });

    it.each([
      ["entero", 5],
      ["un decimal", 5.5],
      ["dos decimales", 5.25],
    ])("sigue aceptando %s", (_caso, cantidad) => {
      expect(agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, cantidad }).success).toBe(true);
    });
  });

  describe("@IsDateString (el backend responde 400 si no es una fecha)", () => {
    it("crearCompra rechaza una fechaSolicitud que no es fecha", () => {
      const r = crearCompraSchema.safeParse({ motivo: "Reposición", fechaSolicitud: "abc" });
      expect(r.success).toBe(false);
    });

    it("agregarItemCompra rechaza una fechaCotizacion que no es fecha", () => {
      expect(agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, fechaCotizacion: "abc" }).success).toBe(
        false,
      );
    });

    it("sigue aceptando el formato que emite <input type=\"date\">", () => {
      const r = crearCompraSchema.safeParse({ motivo: "Reposición", fechaSolicitud: "2026-01-01" });
      expect(r.success).toBe(true);
    });
  });

  describe("motivo en blanco (el DOMINIO lo rechaza con 422, aunque el DTO lo deje pasar)", () => {
    it.each([
      ["cerrarItemConFaltante", cerrarItemConFaltanteSchema],
      ["cancelarCompra", cancelarCompraSchema],
    ])("%s rechaza un motivo de solo espacios", (_nombre, schema) => {
      expect(schema.safeParse({ motivo: "   " }).success).toBe(false);
    });

    it("crearCompra rechaza un motivo de solo espacios", () => {
      expect(crearCompraSchema.safeParse({ motivo: "  ", fechaSolicitud: "2026-01-01" }).success).toBe(
        false,
      );
    });
  });
});
