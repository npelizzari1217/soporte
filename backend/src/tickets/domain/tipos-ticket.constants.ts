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

/**
 * Módulos cuyas altas permiten elegir el tipo de ticket: `POST /tickets` (TICKETS) y
 * `POST /reparaciones` (EDILICIA). Compras no crea tickets con tipo y Equipos usa siempre SOPORTE,
 * así que un tipo de esos módulos no se podría usar (odd/tasks/tipos-ticket-por-modulo.md, S4).
 * El front espeja esta lista.
 */
export const MODULOS_CON_ALTA_DE_TIPO: readonly string[] = ['TICKETS', 'EDILICIA'];

export function moduloTieneAltaDeTipo(modulo: string): boolean {
  return MODULOS_CON_ALTA_DE_TIPO.includes(modulo);
}

/**
 * ¿El tipo se puede elegir en un alta manual (`POST /tickets` o `POST /reparaciones`)? Desde
 * odd/ticket-unificado (S6) las dos altas ofrecen los mismos tipos: los de un módulo con alta de
 * tipo, salvo PREVENTIVO, que lo genera solo el barrido. Los flujos de sistema (barrido, API de
 * integraciones) no pasan por esta regla.
 *
 * @param tipo Código y módulo del tipo.
 * @returns `true` si un actor puede abrir a mano un ticket de ese tipo.
 */
export function admiteAltaManual(tipo: { codigo: string; modulo: string }): boolean {
  return moduloTieneAltaDeTipo(tipo.modulo) && tipo.codigo !== TIPO_CODIGO_PREVENTIVO;
}
