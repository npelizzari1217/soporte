import { describe, it, expect } from "vitest";
import ConfirmarPedidoPage from "./page";

// Spec: sdd/formulario-publico-qr, pedido-publico. El cable entre el slug de la URL y el container.
describe("ConfirmarPedidoPage (\"/c/[slug]/pedido/confirmar\")", () => {
  it("pasa el slug al container", async () => {
    const el = await ConfirmarPedidoPage({ params: Promise.resolve({ slug: "mi-colegio" }) });

    expect(el.props.slug).toBe("mi-colegio");
  });
});
