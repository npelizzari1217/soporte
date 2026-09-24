/**
 * Tope de largo de la descripción del feriado y regex de fecha, espejando
 * la autoridad del backend (D9, design.md).
 *
 * Autoridad: `FERIADO_DESCRIPCION_MAX_LENGTH` y `FECHA_CALENDARIO_REGEX` en
 * `backend/src/calendario-laboral/domain/feriados.constants.ts`, que
 * `feriado.dto.ts` y `feriado-cliente.dto.ts` importan directamente. Esas
 * dos capas backend están unidas por un `import`, así que NO pueden
 * divergir entre sí. Estos valores son una copia a mano, mismo criterio
 * que `features/ciclos-master/limites.ts`.
 *
 * OJO con el alcance de esa garantía: el centinela del test fija estos
 * valores contra su copia exacta, lo que atrapa una edición accidental acá,
 * pero NO un cambio del lado del backend — si `FERIADO_DESCRIPCION_MAX_LENGTH`
 * pasa a 250 mañana, el backend se mueve y acá hay que venir a mano.
 *
 * Vive en la feature y no en `shared/lib/` porque estos campos los escribe
 * un solo módulo: feriados (globales, ROOT; y por cliente, ADMINISTRADOR).
 */
export const FERIADO_DESCRIPCION_MAX_LENGTH = 200;
export const FECHA_CALENDARIO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
