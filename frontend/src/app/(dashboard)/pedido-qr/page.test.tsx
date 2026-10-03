import { describe, it, expect } from "vitest";
import PedidoQrPage from "./page";

// Spec: sdd/formulario-publico-qr (D3). Cable entre la URL (`?c=`, `?e=`) y el landing.
describe("PedidoQrPage (\"/pedido-qr\")", () => {
  it("pasa slug y token al landing", async () => {
    const el = await PedidoQrPage({ searchParams: Promise.resolve({ c: "mi-colegio", e: "tok-1" }) });
    expect(el.props.slug).toBe("mi-colegio");
    expect(el.props.tokenQr).toBe("tok-1");
  });

  it("ausentes o vacios son null; repetidos toman el primero", async () => {
    const sin = await PedidoQrPage({ searchParams: Promise.resolve({}) });
    const vacio = await PedidoQrPage({ searchParams: Promise.resolve({ c: "", e: "" }) });
    const varios = await PedidoQrPage({ searchParams: Promise.resolve({ c: ["a", "b"], e: ["x", "y"] }) });
    expect(sin.props).toMatchObject({ slug: null, tokenQr: null });
    expect(vacio.props).toMatchObject({ slug: null, tokenQr: null });
    expect(varios.props).toMatchObject({ slug: "a", tokenQr: "x" });
  });
});
