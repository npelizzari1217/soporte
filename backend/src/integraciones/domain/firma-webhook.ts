import { createHmac, randomBytes } from 'node:crypto';

/**
 * Formato del aviso para el integrador (odd/webhooks, CA7; T8 lo documenta):
 *
 * - `X-Soporte-Timestamp`: segundos unix del envío.
 * - `X-Soporte-Firma`: HMAC-SHA256 en hexadecimal (minúsculas) de `<timestamp>.<cuerpo>`, donde
 *   `<cuerpo>` es el cuerpo crudo tal como llegó, y la clave es el secreto completo, con su prefijo
 *   `whsec_`, en UTF-8.
 * - `X-Soporte-Evento`: el evento (`TICKET_CREADO`, ...).
 * - `X-Soporte-Entrega`: id de entrega; se repite entre reintentos, para descartar duplicados.
 *
 * El receptor recalcula la firma, la compara en tiempo constante y descarta timestamps viejos.
 */
export const ENCABEZADO_FIRMA_WEBHOOK = 'X-Soporte-Firma';
export const ENCABEZADO_TIMESTAMP_WEBHOOK = 'X-Soporte-Timestamp';
export const ENCABEZADO_EVENTO_WEBHOOK = 'X-Soporte-Evento';
export const ENCABEZADO_ENTREGA_WEBHOOK = 'X-Soporte-Entrega';

/** Prefijo reconocible del secreto, como `sop_` en las claves de la API: delata una fuga. */
export const PREFIJO_SECRETO_WEBHOOK = 'whsec_';

/** HMAC-SHA256 hexadecimal de `<timestamp>.<cuerpo>` con el secreto en claro. */
export function firmarWebhook(secreto: string, timestamp: number, cuerpo: string): string {
  return createHmac('sha256', secreto).update(`${timestamp}.${cuerpo}`).digest('hex');
}

/**
 * Genera un secreto de 32 bytes aleatorios (256 bits) en base64url con el prefijo `whsec_`. El
 * prefijo sigue la convención de `generarClaveApi`; base64url lo deja corto y sin caracteres que
 * haya que escapar al copiarlo a una variable de entorno.
 */
export function generarSecretoWebhook(): string {
  return `${PREFIJO_SECRETO_WEBHOOK}${randomBytes(32).toString('base64url')}`;
}
