/**
 * Cantidad de días y techo de minutos del horario laboral, espejando la
 * autoridad del backend (D9/D15, design.md).
 *
 * Autoridad: `DIAS_POR_SEMANA`/`MINUTOS_POR_DIA` en
 * `backend/src/calendario-laboral/domain/constants/horario-laboral.constants.ts`,
 * que el DTO (`horario-laboral.dto.ts`) y el dominio importan directamente
 * — esas dos capas backend están unidas por un `import`, así que no pueden
 * divergir entre sí. Este valor es una copia a mano, mismo criterio que
 * `features/feriados/limites.ts`.
 *
 * OJO con el alcance de esta garantía: el centinela del test fija estos
 * valores contra su copia exacta, lo que atrapa una edición accidental acá,
 * pero NO un cambio del lado del backend — si `MINUTOS_POR_DIA` cambiara
 * mañana, el backend se mueve y acá hay que venir a mano.
 *
 * Vive en la feature y no en `shared/lib/` porque estos campos los escribe
 * un solo módulo: horario laboral (ADMINISTRADOR de cliente o ROOT).
 */
export const DIAS_POR_SEMANA = 7;
export const MINUTOS_POR_DIA = 1440;
