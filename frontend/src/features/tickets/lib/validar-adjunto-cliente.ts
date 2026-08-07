/**
 * validarAdjuntoCliente — mirror cliente-side de
 * `backend/src/tickets/interface/pipes/validar-archivo-adjunto.ts`
 * (T21/T1.13). Evita subir un archivo que el backend va a rechazar de
 * todos modos (10MB, whitelist de mime) — feedback inmediato en vez de un
 * roundtrip de red + 422.
 */
export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;

const MIME_WHITELIST_EXACTA = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
]);

function esMimeWhitelisted(mimeType: string): boolean {
  return mimeType.startsWith("image/") || MIME_WHITELIST_EXACTA.has(mimeType);
}

/** Devuelve un mensaje de error (español, listo para toast/UI) o `null` si el archivo es válido. */
export function validarAdjuntoCliente(file: File): string | null {
  if (file.size <= 0) {
    return "El archivo no puede estar vacío (0 bytes).";
  }
  if (file.size > MAX_ADJUNTO_BYTES) {
    return "El archivo excede el tamaño máximo permitido de 10MB.";
  }
  if (!esMimeWhitelisted(file.type)) {
    return `Tipo de archivo no permitido: "${file.type}". Permitidos: imágenes, PDF, Office, ZIP.`;
  }
  return null;
}
