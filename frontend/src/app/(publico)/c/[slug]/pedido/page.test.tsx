import { describe, it, expect } from "vitest";
import PedidoPublicoPage from "./page";

// Spec: sdd/formulario-publico-qr, pedido-publico. Prueba el cable entre la URL (slug y `?e=`) y el
// container: con valores hardcodeados el resto de los tests seguiría en verde.
describe("PedidoPublicoPage (\"/c/[slug]/pedido\")", () => {
  it("pasa el slug y el token del QR al container", async () => {
    const el = await PedidoPublicoPage({
      params: Promise.resolve({ slug: "mi-colegio" }),
      searchParams: Promise.resolve({ e: "tok-1" }),
    });

    expect(el.props.slug).toBe("mi-colegio");
    expect(el.props.tokenQr).toBe("tok-1");
  });

  it("sin `e`, o vacío, el token es null; con `e` repetido toma el primero", async () => {
    const sin = await PedidoPublicoPage({ params: Promise.resolve({ slug: "s" }), searchParams: Promise.resolve({}) });
    const vacio = await PedidoPublicoPage({ params: Promise.resolve({ slug: "s" }), searchParams: Promise.resolve({ e: "" }) });
    const varios = await PedidoPublicoPage({ params: Promise.resolve({ slug: "s" }), searchParams: Promise.resolve({ e: ["a", "b"] }) });

    expect(sin.props.tokenQr).toBeNull();
    expect(vacio.props.tokenQr).toBeNull();
    expect(varios.props.tokenQr).toBe("a");
  });
});
