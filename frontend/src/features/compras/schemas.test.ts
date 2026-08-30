import { describe, it, expect } from "vitest";
import {
  agregarItemCompraSchema,
  cancelarCompraSchema,
  cerrarItemConFaltanteSchema,
  crearCompraSchema,
  editarItemCompraSchema,
  registrarOrdenDeItemSchema,
  registrarRecepcionDeItemSchema,
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
      ["cantidad", { cantidad: 1.999, monto: 10 }, ["cantidad"]],
      ["monto", { monto: 10.555 }, ["monto"]],
    ])("editarItemCompra rechaza más de 2 decimales en %s", (_campo, input, path) => {
      // Con `monto` ahora requerido, un input sin `monto` fallaría por DOS
      // motivos (decimales de cantidad + monto ausente) y la aserción
      // dejaría de probar lo que dice — se completa con un monto válido y
      // se aprieta al `path` exacto del issue.
      const r = editarItemCompraSchema.safeParse(input);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toEqual(path);
    });

    it("registrarRecepcionDeItem rechaza más de 2 decimales", () => {
      expect(registrarRecepcionDeItemSchema.safeParse({ cantidadRecibida: 3.001 }).success).toBe(false);
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

  describe("cero fantasma: un campo vacío NO se coerciona a 0", () => {
    it("registrarOrdenDeItem rechaza la cantidad vacía en vez de coercionarla a 0", () => {
      expect(registrarOrdenDeItemSchema.safeParse({ cantidadOrdenada: "" }).success).toBe(false);
    });

    it.each([["vacío", ""], ["solo espacios", "   "]])(
      "registrarOrdenDeItem rechaza cantidadOrdenada %s",
      (_caso, valor) => {
        expect(registrarOrdenDeItemSchema.safeParse({ cantidadOrdenada: valor }).success).toBe(false);
      },
    );

    it("registrarOrdenDeItem acepta cantidadOrdenada en \"0\" explícito (hermano invertido)", () => {
      const r = registrarOrdenDeItemSchema.safeParse({ cantidadOrdenada: "0" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cantidadOrdenada).toBe(0);
    });

    it.each([["vacío", ""], ["solo espacios", "   "]])(
      "registrarRecepcionDeItem rechaza cantidadRecibida %s",
      (_caso, valor) => {
        expect(registrarRecepcionDeItemSchema.safeParse({ cantidadRecibida: valor }).success).toBe(false);
      },
    );

    it("registrarRecepcionDeItem acepta cantidadRecibida en \"0\" explícito (hermano invertido)", () => {
      const r = registrarRecepcionDeItemSchema.safeParse({ cantidadRecibida: "0" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cantidadRecibida).toBe(0);
    });

    it.each([["vacío", ""], ["solo espacios", "   "]])(
      "registrarEntregaDeItem rechaza cantidadEntregada %s",
      (_caso, valor) => {
        expect(registrarEntregaDeItemSchema.safeParse({ cantidadEntregada: valor }).success).toBe(false);
      },
    );

    it("registrarEntregaDeItem acepta cantidadEntregada en \"0\" explícito (hermano invertido)", () => {
      const r = registrarEntregaDeItemSchema.safeParse({ cantidadEntregada: "0" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.cantidadEntregada).toBe(0);
    });

    it.each([["vacío", ""], ["solo espacios", "   "]])(
      "agregarItemCompra rechaza monto %s en vez de coercionarlo a 0",
      (_caso, valor) => {
        expect(agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, monto: valor }).success).toBe(false);
      },
    );

    it("agregarItemCompra acepta monto en \"0\" explícito (hermano invertido)", () => {
      const r = agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, monto: "0" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.monto).toBe(0);
    });

    it.each([["vacío", ""], ["solo espacios", "   "]])(
      "editarItemCompra rechaza monto %s en vez de omitirlo en silencio",
      (_caso, valor) => {
        expect(editarItemCompraSchema.safeParse({ monto: valor }).success).toBe(false);
      },
    );

    it("editarItemCompra sigue rechazando un objeto sin monto (monto ahora requerido)", () => {
      expect(editarItemCompraSchema.safeParse({}).success).toBe(false);
    });

    it("editarItemCompra acepta monto en \"0\" explícito (hermano invertido)", () => {
      const r = editarItemCompraSchema.safeParse({ monto: "0" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.monto).toBe(0);
    });
  });

  describe("cantidad no cambia de comportamiento (helper nuevo no la toca)", () => {
    it("agregarItemCompra sigue rechazando cantidad vacía por el mismo mecanismo de antes", () => {
      const r = agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, cantidad: "" });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toEqual(["cantidad"]);
    });

    it("agregarItemCompra sigue rechazando cantidad en \"0\"", () => {
      expect(agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, cantidad: "0" }).success).toBe(false);
    });
  });

  describe("formato es-AR en monto (Enter sin blur deja el texto crudo en el form)", () => {
    it.each([
      ["miles y decimales", "1.234.567,89", 1234567.89],
      ["solo decimales", "1000,50", 1000.5],
    ])("agregarItemCompra acepta monto en formato es-AR %s", (_caso, valor, esperado) => {
      const r = agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, monto: valor });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.monto).toBe(esperado);
    });

    it("editarItemCompra acepta monto en formato es-AR", () => {
      const r = editarItemCompraSchema.safeParse({ monto: "1.234.567,89" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.monto).toBe(1234567.89);
    });

    it("agregarItemCompra sigue rechazando texto no numérico en monto", () => {
      const r = agregarItemCompraSchema.safeParse({ ...ITEM_VALIDO, monto: "abc" });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("Ingresá un monto válido");
    });
  });
});
