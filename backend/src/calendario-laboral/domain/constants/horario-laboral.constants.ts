/**
 * Constantes de dominio de `HorarioLaboralSemanal` (sdd/horario-laboral-por-cliente,
 * WU-2). Viven acá porque el dominio es la autoridad del límite: el CHECK
 * `calendario_laboral_dias_cliente_ventana_check` (D1, migración
 * `20260928150000_calendario_laboral_dias_cliente`) es backstop, nunca al
 * revés — mismo criterio que `feriados.constants.ts`. El DTO (WU-6a) y el
 * frontend `features/horario-laboral/limites.ts` (WU-7) importan/espejan
 * estas mismas constantes para que borde y dominio nunca diverjan (D9/D15).
 */

/** Cantidad exacta de días que debe tener un `HorarioLaboralSemanal`: uno por día de la semana. */
export const DIAS_POR_SEMANA = 7;

/**
 * Techo de los minutos de apertura/cierre: `1440` representa la medianoche
 * de fin de día (24:00), no un minuto dentro del día. `cierreMinuto` puede
 * valer hasta `MINUTOS_POR_DIA`; `aperturaMinuto` nunca, porque
 * `apertura < cierre <= MINUTOS_POR_DIA` ya lo excluye.
 */
export const MINUTOS_POR_DIA = 1440;

/** Piso de los minutos de apertura/cierre: medianoche de inicio de día. */
export const MINUTO_MINIMO_DIA = 0;
