import { describe, expect, it } from "vitest";
import { PEDIDO_LIMITES, pedidoPublicoSchema } from "./schemas";

// Spec: sdd/formulario-publico-qr, pedido-publico. Los límites espejan a `PedidoPublicoDto`.

const VALIDO = {
  nombre: "Ana Pérez",
  email: "ana@example.com",
  titulo: "No enciende la PC",
  descripcion: "Desde ayer no prende.",
};

/** Email sintácticamente válido de exactamente `largo` caracteres (local 64, labels de hasta 63). */
function emailDeLargo(largo: number): string {
  const local = "a".repeat(64);
  let resto = largo - local.length - 1 - ".com".length; // largo del dominio sin el TLD
  const labels: string[] = [];
  while (resto > 0) {
    const largoLabel = Math.min(63, resto);
    labels.push("b".repeat(largoLabel));
    resto -= largoLabel + 1; // + el punto que separa
  }
  return `${local}@${labels.join(".")}.com`;
}

describe("pedidoPublicoSchema", () => {
  it("el helper arma emails del largo pedido", () => {
    expect(emailDeLargo(PEDIDO_LIMITES.emailMax)).toHaveLength(PEDIDO_LIMITES.emailMax);
    expect(emailDeLargo(PEDIDO_LIMITES.emailMax + 1)).toHaveLength(PEDIDO_LIMITES.emailMax + 1);
  });

  it("acepta un pedido mínimo y el teléfono es opcional", () => {
    expect(pedidoPublicoSchema.safeParse(VALIDO).success).toBe(true);
    expect(pedidoPublicoSchema.safeParse({ ...VALIDO, telefono: "" }).success).toBe(true);
  });

  it("recorta los textos antes de medirlos", () => {
    const r = pedidoPublicoSchema.parse({ ...VALIDO, nombre: "  Ana  ", titulo: "  abc  " });
    expect(r.nombre).toBe("Ana");
    expect(r.titulo).toBe("abc");
  });

  it.each([
    ["nombre", { nombre: "   " }],
    ["nombre", { nombre: "a".repeat(PEDIDO_LIMITES.nombreMax + 1) }],
    ["email", { email: "no-es-email" }],
    ["email", { email: emailDeLargo(PEDIDO_LIMITES.emailMax + 1) }],
    ["telefono", { telefono: "1".repeat(PEDIDO_LIMITES.telefonoMax + 1) }],
    ["titulo", { titulo: "ab" }],
    ["titulo", { titulo: "a".repeat(PEDIDO_LIMITES.tituloMax + 1) }],
    ["descripcion", { descripcion: "  " }],
    ["descripcion", { descripcion: "a".repeat(PEDIDO_LIMITES.descripcionMax + 1) }],
  ])("rechaza %s fuera de límite", (campo, parche) => {
    const r = pedidoPublicoSchema.safeParse({ ...VALIDO, ...parche });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe(campo);
  });

  it("acepta los valores exactos de cada límite", () => {
    const r = pedidoPublicoSchema.safeParse({
      nombre: "a".repeat(PEDIDO_LIMITES.nombreMax),
      email: emailDeLargo(PEDIDO_LIMITES.emailMax),
      telefono: "1".repeat(PEDIDO_LIMITES.telefonoMax),
      titulo: "a".repeat(PEDIDO_LIMITES.tituloMax),
      descripcion: "a".repeat(PEDIDO_LIMITES.descripcionMax),
    });
    expect(r.success).toBe(true);
  });
});
