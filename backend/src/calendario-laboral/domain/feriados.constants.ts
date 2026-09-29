/**
 * Constantes de dominio del módulo `feriados` (feriados globales y por
 * cliente, sdd/feriados-configurables). Viven acá porque el dominio es la
 * autoridad del límite: el `VARCHAR(200)` de Postgres (`prisma_master/schema.prisma`,
 * `prisma_tenant/schema.prisma` desde WU3) es backstop, nunca al revés —
 * mismo criterio que el resto de las constantes de
 * límite compartidas entre dominio y borde. El DTO
 * (WU2/WU4) y el frontend `features/feriados/limites.ts` (WU6) importan
 * estas mismas constantes para que borde y dominio nunca diverjan (D9).
 *
 * `FECHA_CALENDARIO_REGEX` exige una fecha SOLA `'YYYY-MM-DD'`, sin hora ni
 * offset: `@IsDateString` acepta `'2026-10-12T02:00:00-03:00'`, que puede
 * caer en otro día UTC (D2, design.md). Es NECESARIA pero no SUFICIENTE —
 * `2026-02-30` la pasa igual; `FechaCalendario.crear()` valida además que la
 * fecha exista realmente en el calendario.
 */
export const FERIADO_DESCRIPCION_MAX_LENGTH = 200;
export const FECHA_CALENDARIO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
