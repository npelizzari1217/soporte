import { describe, it, expect } from "vitest";
import EncuestaPage from "./page";

// Spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
// público". Verify #3 (CRITICAL-2): probamos `EncuestaView` inyectándole el
// token a mano y probamos el middleware dejando pasar la ruta, pero nunca el
// cable que conecta el parámetro de la URL con el container. Con
// `<EncuestaView token="" />` hardcodeado, 794/794 quedaban en verde.
describe("EncuestaPage (\"/encuesta/[token]\")", () => {
  it("pasa el token del parámetro de ruta al container EncuestaView", async () => {
    const elemento = await EncuestaPage({ params: Promise.resolve({ token: "tok-123" }) });

    expect(elemento.props.token).toBe("tok-123");
  });
});
