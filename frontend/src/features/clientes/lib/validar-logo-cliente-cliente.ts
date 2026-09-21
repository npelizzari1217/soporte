/**
 * validarLogoClienteCliente — mirror cliente-side de
 * `backend/src/clientes/interface/pipes/validar-logo-cliente.ts`
 * (sdd/logo-por-cliente, WU4). Evita un roundtrip de red que el backend va a
 * rechazar de todos modos con 422: whitelist EXACTA de 3 mimes, JAMÁS un
 * prefijo `image/*` (aceptaría `image/svg+xml` — vector de XSS inaceptable
 * para un archivo servido `inline` a todos los usuarios del tenant,
 * design.md D7). Mismo criterio que `validar-adjunto-cliente.ts` (tickets):
 * función pura, sin Zod — este repo no tiene precedente de validar `File`
 * con un schema, y los otros dos espejos cliente-side de un pipe binario
 * tampoco lo usan.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

/** Espejo EXACTO de `MIMES_LOGO` del backend — nunca un `startsWith("image/")`. */
export const MIMES_LOGO = new Set<string>(["image/png", "image/jpeg", "image/webp"]);

/** Devuelve un mensaje de error (español, listo para UI) o `null` si el archivo es válido. */
export function validarLogoClienteCliente(file: File): string | null {
  if (file.size <= 0) {
    return "El archivo no puede estar vacío (0 bytes).";
  }
  if (file.size > MAX_LOGO_BYTES) {
    return "El archivo excede el tamaño máximo permitido de 512 KB.";
  }
  if (!MIMES_LOGO.has(file.type)) {
    return `Tipo de archivo no permitido: "${file.type}". Permitidos: PNG, JPEG, WebP.`;
  }
  return null;
}
