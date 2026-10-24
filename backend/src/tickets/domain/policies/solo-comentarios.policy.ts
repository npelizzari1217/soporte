/**
 * Política "ticket resuelto, cerrado o cancelado: solo comentarios" (odd/cerrado-solo-comentarios,
 * S1-S3).
 *
 * En esos estados, quien no es ADMINISTRADOR ni ROOT solo puede comentar el ticket: no edita sus
 * campos, no toca sus tareas, no adjunta archivos, no vincula ni desvincula compras, no lo reasigna
 * y no lo saca de esos estados. ADMINISTRADOR y ROOT quedan exentos: pueden corregir y reabrir.
 *
 * Es la regla única de todas las escrituras sobre un ticket existente; cada caso de uso la aplica
 * después de la autorización del actor (un 404/403 sigue mandando antes que este 422). Los flujos
 * de sistema sin actor no pasan por acá. Sin imports de Prisma ni NestJS — dominio puro.
 */

/** Estados en los que el ticket solo admite comentarios para quien no es administrador (S2). */
export const ESTADOS_SOLO_COMENTARIOS = ['RESUELTO', 'CERRADO', 'CANCELADO'] as const;

/** Código de un estado de `ESTADOS_SOLO_COMENTARIOS`. */
export type EstadoSoloComentarios = (typeof ESTADOS_SOLO_COMENTARIOS)[number];

const CONJUNTO_SOLO_COMENTARIOS: ReadonlySet<string> = new Set(ESTADOS_SOLO_COMENTARIOS);

/**
 * ¿El estado es uno de los que dejan el ticket en solo comentarios, sin mirar al actor?
 *
 * @param estadoCodigo Código del estado.
 * @returns `true` para RESUELTO, CERRADO y CANCELADO.
 */
export function esEstadoSoloComentarios(
  estadoCodigo: string,
): estadoCodigo is EstadoSoloComentarios {
  return CONJUNTO_SOLO_COMENTARIOS.has(estadoCodigo);
}

/**
 * ¿El actor solo puede comentar el ticket en este estado?
 *
 * @param estadoCodigo Código del estado actual del ticket.
 * @param actorEsAdministrador `true` para ADMINISTRADOR del cliente o ROOT (S3).
 * @returns `true` si el estado es RESUELTO, CERRADO o CANCELADO y el actor no es administrador. Con
 *   `true`, `estadoCodigo` queda tipado como `EstadoSoloComentarios`.
 */
export function ticketSoloComentarios(
  estadoCodigo: string,
  actorEsAdministrador: boolean,
): estadoCodigo is EstadoSoloComentarios {
  return !actorEsAdministrador && esEstadoSoloComentarios(estadoCodigo);
}
