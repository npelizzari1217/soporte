/**
 * Códigos FIJOS de tipos_ticket compartidos entre módulos (dominio de
 * tickets). Constante única para evitar duplicar el string literal en cada
 * consumidor (preventivo, SLA, seeder de tenants).
 *
 * Ref issue: #135 — el preventivo dejó de reusar el tipo `MANTENIMIENTO` de
 * EDILICIA y tiene su propio tipo `PREVENTIVO`, para que sus tickets no
 * entren en `cumplimientoSla`.
 */

/** Código FIJO del tipo de ticket que genera el barrido de mantenimiento preventivo. */
export const TIPO_CODIGO_PREVENTIVO = 'PREVENTIVO';

/** Código FIJO del tipo de ticket de Soporte (QR, equipos, alta de soporte). */
export const TIPO_CODIGO_SOPORTE = 'SOPORTE';

/** Código FIJO del tipo de ticket de Edilicia (reparaciones). */
export const TIPO_CODIGO_EDILICIA = 'EDILICIA';

/**
 * Tipos FIJOS del sistema: hay flujos que los resuelven por `codigo`
 * (preventivo, QR, equipos, edilicia). No se pueden desactivar —ni siquiera
 * ROOT— ni cambiarles el `codigo`; el nombre sí. El front espeja esta lista.
 */
export const TIPOS_TICKET_DEL_SISTEMA: readonly string[] = [
  TIPO_CODIGO_PREVENTIVO,
  TIPO_CODIGO_SOPORTE,
  TIPO_CODIGO_EDILICIA,
];

export function esTipoTicketDelSistema(codigo: string): boolean {
  return TIPOS_TICKET_DEL_SISTEMA.includes(codigo);
}
