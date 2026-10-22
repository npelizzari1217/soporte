/**
 * Códigos de `tipo_operacion` del borrado lógico de un ticket y de su recuperación
 * (odd/tasks/permisos-por-tipo-ticket.md, S8, L41). Los siembra la migración
 * `20261022120000_tipos_operacion_borrado` en cada inquilino.
 */
export const TIPO_OPERACION_BORRADO = {
  BORRADO: 'TICKET_BORRADO',
  RECUPERADO: 'TICKET_RECUPERADO',
} as const;

/** Código de un tipo de operación del borrado de tickets. */
export type CodigoOperacionBorrado =
  (typeof TIPO_OPERACION_BORRADO)[keyof typeof TIPO_OPERACION_BORRADO];
