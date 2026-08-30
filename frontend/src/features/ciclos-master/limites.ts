/**
 * Tope de largo del nombre del ciclo vigente, espejando la autoridad del
 * backend.
 *
 * Autoridad: `CICLO_VIGENTE_NOMBRE_MAX_LENGTH` en `CicloVigenteEntity`, que
 * espeja `ciclosVigentes.nombre VarChar(100)`, y `ciclo-vigente.dto.ts` importa
 * esa misma constante.
 *
 * OJO con el alcance de esa garantía: entidad y DTO están unidas por un
 * `import`, así que ESAS dos no pueden divergir. Este número es una copia a
 * mano. El centinela del test lo fija contra 100, lo que atrapa una edición
 * accidental pero NO un cambio de la columna: si mañana pasa a 150, el backend
 * se mueve y acá hay que venir a mano.
 *
 * Vive en la feature y no en `shared/lib/` porque este campo lo escribe un solo
 * módulo: el ABM de ciclos vigentes, exclusivo de ROOT.
 */
export const CICLO_VIGENTE_NOMBRE_MAX_LENGTH = 100;
