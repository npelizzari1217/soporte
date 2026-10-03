/**
 * Autor de la operación de apertura de los tickets creados por el formulario público.
 *
 * `operaciones_ticket.autor_id` es NOT NULL y un solicitante externo no tiene usuario. Se usa el
 * UUID nulo, que `gen_random_uuid()` nunca genera, así que no puede coincidir con un usuario real.
 * El timeline no resuelve nombres de autor, por lo que no hace falta una fila que lo respalde.
 *
 * Ref design: sdd/formulario-publico-qr ADR-6 (autor de la operación de apertura).
 */
export const AUTOR_FORMULARIO_PUBLICO = '00000000-0000-0000-0000-000000000000';
