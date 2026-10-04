import { describe, it, expect } from "vitest";
import { ladoQr, matrizQr, pathQr, qrEquipoSchema, svgQrComoTexto, QR_BORDE } from "./qr-equipo";

const URL_QR = "https://soporte.example.com/c/acme/pedido?e=abcDEF123_-xyz";

describe("qr-equipo", () => {
  it("matrizQr devuelve una matriz cuadrada con módulos oscuros", () => {
    const m = matrizQr(URL_QR);
    expect(m.length).toBeGreaterThan(20);
    expect(m.every((fila) => fila.length === m.length)).toBe(true);
    expect(m.some((fila) => fila.some(Boolean))).toBe(true);
  });

  it("la zona de silencio suma el borde a cada lado", () => {
    const m = matrizQr(URL_QR);
    expect(ladoQr(m)).toBe(m.length + QR_BORDE * 2);
  });

  it("pathQr desplaza cada módulo por el borde", () => {
    expect(pathQr([[true, false], [false, true]])).toBe(
      `M${QR_BORDE} ${QR_BORDE}h1v1h-1z` + `M${QR_BORDE + 1} ${QR_BORDE + 1}h1v1h-1z`,
    );
  });

  it("svgQrComoTexto es un SVG autocontenido sin la URL en claro", () => {
    const svg = svgQrComoTexto(URL_QR);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toContain("abcDEF123");
  });

  it("el schema acepta la respuesta del backend y rechaza una URL inválida", () => {
    expect(qrEquipoSchema.safeParse({ url: URL_QR, emitidoAt: "2026-10-03T10:00:00.000Z" }).success).toBe(true);
    expect(qrEquipoSchema.safeParse({ url: "no-es-url", emitidoAt: "x" }).success).toBe(false);
    expect(qrEquipoSchema.safeParse({ url: URL_QR }).success).toBe(false);
  });
});
