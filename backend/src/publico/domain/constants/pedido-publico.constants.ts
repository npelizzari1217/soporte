/**
 * Vigencia del link de verificación del pedido público: 24 h.
 *
 * Es una decisión del dueño del producto (2026-10-03, roadmap), no una elección técnica: el token
 * no cambia una credencial, crea un ticket, y quien escanea frente al equipo suele leer el mail más
 * tarde. Ref: sdd/formulario-publico-qr, ADR-7.
 */
export const PEDIDO_PUBLICO_TTL_MS = 24 * 60 * 60 * 1000;
