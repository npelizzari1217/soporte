/**
 * Autor de las operaciones que escribe el sistema (hoy, la `ASIGNACION` de la regla automática).
 * `operaciones_ticket.autor_id` es NOT NULL y atribuirla al actor humano sería falso; reusar el UUID
 * nulo de `AUTOR_FORMULARIO_PUBLICO` mezclaría "externo" con "sistema". Su nibble de versión es 0,
 * así que `gen_random_uuid()` (v4) nunca lo genera. Ref design: asignacion-automatica-por-tipo ADR-4.
 */
export const AUTOR_SISTEMA = '00000000-0000-0000-0000-000000000001';

/** Texto que lee la persona en el timeline cuando asigna la regla del tipo. */
export const DESCRIPCION_ASIGNACION_POR_REGLA =
  'Asignado automáticamente por la regla de asignación del tipo de ticket.';

/** Valor de `metadata.origen` de la `ASIGNACION` escrita por la regla (para máquinas). */
export const ORIGEN_ASIGNACION = 'REGLA_TIPO';
