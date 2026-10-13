const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;

/**
 * Espera antes de cada reintento, en milisegundos (odd/webhooks, D1). El elemento `i` es la espera
 * después del intento `i + 1`. Suman 23 h 51 min: con el primer envío, son 10 intentos en unas 24 h.
 */
export const ESPERAS_REINTENTO_WEBHOOK_MS: readonly number[] = [
  1 * MINUTO_MS,
  5 * MINUTO_MS,
  15 * MINUTO_MS,
  30 * MINUTO_MS,
  1 * HORA_MS,
  2 * HORA_MS,
  4 * HORA_MS,
  8 * HORA_MS,
  8 * HORA_MS,
];

/**
 * Fecha del próximo intento tras `intentosRealizados` intentos fallidos (contando el que acaba de
 * fallar), o `null` si se agotó la ventana de reintentos y la entrega debe quedar FALLIDA.
 *
 * @throws RangeError si `intentosRealizados` no es un entero mayor o igual a 1 (es un bug del
 *   llamador: no hay reintento sin un intento previo).
 */
export function calcularProximoIntento(intentosRealizados: number, ahora: Date): Date | null {
  if (!Number.isInteger(intentosRealizados) || intentosRealizados < 1) {
    throw new RangeError(`intentosRealizados debe ser un entero >= 1: ${intentosRealizados}`);
  }
  const espera = ESPERAS_REINTENTO_WEBHOOK_MS[intentosRealizados - 1];
  return espera === undefined ? null : new Date(ahora.getTime() + espera);
}
