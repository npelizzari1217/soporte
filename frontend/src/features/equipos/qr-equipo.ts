/**
 * QR del equipo (sdd/formulario-publico-qr, ADR-10). Espejo de `QrEquipoResponseDto`
 * del backend (`POST /equipos/:id/qr`) y utilidades para dibujar el QR como SVG propio
 * (sin `dangerouslySetInnerHTML`) y exportarlo a SVG o PNG.
 */
import { encode } from "uqr";
import { z } from "zod";

export const qrEquipoSchema = z.object({
  url: z.string().url(),
  emitidoAt: z.string().min(1),
});

export type QrEquipo = z.infer<typeof qrEquipoSchema>;

/** Avisos por `ApiError.code` de `POST /equipos/:id/qr`. */
export const AVISO_QR_POR_CODIGO: Record<string, string> = {
  QR_REQUIERE_SLUG: "Este cliente todavía no tiene un slug cargado. Pedile a un administrador global que lo configure.",
  QR_SLUG_CAMBIADO: "El slug del cliente cambió mientras se emitía el QR. Intentá de nuevo.",
};

/** Módulos por lado de la zona de silencio que exige el estándar QR. */
export const QR_BORDE = 2;
const ECC = "M" as const;

/** Matriz de módulos del QR (true = oscuro), sin borde. */
export function matrizQr(texto: string): boolean[][] {
  return encode(texto, { ecc: ECC, border: 0 }).data;
}

/** Rectángulos oscuros como path SVG (una sola figura): `M x y h1 v1 h-1 z` por módulo. */
export function pathQr(matriz: boolean[][]): string {
  const partes: string[] = [];
  matriz.forEach((fila, y) => {
    fila.forEach((oscuro, x) => {
      if (oscuro) partes.push(`M${x + QR_BORDE} ${y + QR_BORDE}h1v1h-1z`);
    });
  });
  return partes.join("");
}

export function ladoQr(matriz: boolean[][]): number {
  return matriz.length + QR_BORDE * 2;
}

/** SVG completo como texto, para descargar o imprimir. Solo contiene números. */
export function svgQrComoTexto(texto: string): string {
  const matriz = matrizQr(texto);
  const lado = ladoQr(matriz);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="512" height="512" shape-rendering="crispEdges">` +
    `<rect width="${lado}" height="${lado}" fill="#ffffff"/><path d="${pathQr(matriz)}" fill="#000000"/></svg>`
  );
}

/** PNG de `px` píxeles de lado dibujando los módulos directo en un canvas. */
export function pngQr(texto: string, px = 1024): Promise<Blob> {
  const matriz = matrizQr(texto);
  const lado = ladoQr(matriz);
  const escala = Math.max(1, Math.floor(px / lado));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = lado * escala;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("canvas no disponible"));
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  matriz.forEach((fila, y) => {
    fila.forEach((oscuro, x) => {
      if (oscuro) ctx.fillRect((x + QR_BORDE) * escala, (y + QR_BORDE) * escala, escala, escala);
    });
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no se pudo generar el PNG"))), "image/png");
  });
}
