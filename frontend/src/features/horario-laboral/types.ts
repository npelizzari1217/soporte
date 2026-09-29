/**
 * Tipos de la feature `horario-laboral` (horario laboral semanal del
 * TENANT, sdd/horario-laboral-por-cliente, WU-7). Espejo de
 * `backend/src/calendario-laboral/interface/dtos/horario-laboral.dto.ts`:
 * el `GET` y el body/respuesta del `PUT` comparten el MISMO shape —
 * reemplazo completo de las 7 filas en una sola operación (D6/D9,
 * design.md) — por eso un solo tipo sirve para los tres casos.
 *
 * `diaSemana` sigue la convención de `Date.getDay()`: 0 = domingo,
 * 1 = lunes, ..., 6 = sábado (igual que el seed de la migración D1).
 */

/** Un día del horario laboral, siempre ordenado 0..6. */
export interface DiaHorarioLaboral {
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  aperturaMinuto: number | null;
  cierreMinuto: number | null;
}

/** Respuesta de `GET /horario-laboral`. Siempre exactamente 7 días. */
export interface HorarioLaboral {
  dias: DiaHorarioLaboral[];
}

/** Body de `PUT /horario-laboral`. Full-replace: siempre las 7 filas completas (D6). */
export type HorarioLaboralDto = HorarioLaboral;
