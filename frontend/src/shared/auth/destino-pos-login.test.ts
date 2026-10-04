import { describe, it, expect } from "vitest";
import { destinoPosLogin } from "./destino-pos-login";

// Spec: sdd/formulario-publico-qr, pedido-publico (D3) — sin open redirect.
describe("destinoPosLogin", () => {
  it("acepta /pedido-qr con su query (c y e)", () => {
    expect(destinoPosLogin("/pedido-qr?c=mi-colegio&e=tok_1-2")).toBe("/pedido-qr?c=mi-colegio&e=tok_1-2");
  });

  it("acepta /pedido-qr sin query", () => {
    expect(destinoPosLogin("/pedido-qr")).toBe("/pedido-qr");
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative con path", "//evil.com/pedido-qr"],
    ["https absoluto", "https://evil.com"],
    ["https hacia el propio path", "https://evil.com/pedido-qr?c=a"],
    ["esquema javascript", "javascript:alert(1)"],
    ["otra ruta de la app", "/tickets"],
    ["raiz", "/"],
    ["subpath de pedido-qr", "/pedido-qr/otro"],
    ["prefijo que no es el path", "/pedido-qrx"],
    ["path con barra final", "/pedido-qr/"],
    ["path codificado", "/pedido-qr%2f..%2ftickets"],
    ["backslash", "/\\evil.com"],
    ["backslash en la query", "/pedido-qr?c=a\\b"],
    ["sin barra inicial", "pedido-qr?c=a"],
    ["fragmento", "/pedido-qr#//evil.com"],
    ["espacio inicial", " /pedido-qr"],
    ["salto de linea", "/pedido-qr?c=a\r\nLocation: //evil.com"],
    ["tab", "/pedido-qr?c=a\tb"],
    ["vacio", ""],
  ])("cae a / con %s", (_caso, valor) => {
    expect(destinoPosLogin(valor)).toBe("/");
  });

  it("cae a / con null y undefined", () => {
    expect(destinoPosLogin(null)).toBe("/");
    expect(destinoPosLogin(undefined)).toBe("/");
  });
});
