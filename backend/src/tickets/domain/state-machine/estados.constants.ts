/**
 * Constantes de estados compartidas por el dominio de tickets (reglas de
 * bloqueo por estado). Se agrupan acá para no duplicar los códigos entre la
 * entidad, los use cases (edición y transición) y las políticas.
 *
 * Fuente de verdad de los 6 estados fijos (ADR-1): NUEVO, ASIGNADO,
 * EN_PROCESO, RESUELTO, CERRADO, CANCELADO.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 */

/**
 * Estados PREVIOS a EN_PROCESO. Mientras el ticket esté en uno de estos, la
 * edición de datos (título/descripción/prioridad) sigue disponible para
 * TECNICO+ (`ticket:editar`). Una vez que el ticket entra EN_PROCESO (o
 * cualquier estado posterior), solo ROOT puede editar.
 */
export const ESTADOS_PRE_PROCESO: ReadonlySet<string> = new Set(['NUEVO', 'ASIGNADO']);

/**
 * Estados TERMINALES (sin arcos de salida — sin reapertura por el flujo
 * normal, T9/T11). El "salto correctivo" de ROOT/ADMINISTRADOR NUNCA lleva a
 * un estado terminal: para CERRAR/CANCELAR se usan los arcos normales.
 */
export const ESTADOS_TERMINALES: ReadonlySet<string> = new Set(['CERRADO', 'CANCELADO']);
