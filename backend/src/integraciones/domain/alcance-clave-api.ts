import { AccionTipoTicket } from '../../tickets/domain/permisos-tipo-ticket';

/** Módulo de los tipos sobre los que actúa una clave (`modulos: ['TICKETS']` del guard). */
const MODULO_DE_LA_CLAVE = 'TICKETS';

/**
 * Acciones por tipo de cada celda que puede llevar el actor de una clave: las de `PERMISOS_API` y
 * el `TICKETS:VER_TODOS` que `ApiClaveGuard` agrega a una clave de lectura. Es una tabla propia
 * porque la clave conserva su vocabulario de módulo (L50.3) mientras que los usuarios tienen
 * filas por tipo: da lo mismo que daba la traducción de L11 para esas celdas, Imprimir incluido con
 * Ver. Cualquier otra celda no concede nada.
 */
const ACCIONES_POR_CELDA_DE_CLAVE: ReadonlyMap<string, readonly AccionTipoTicket[]> = new Map([
  ['TICKETS:LECTURA', ['LECTURA', 'IMPRESION']],
  ['TICKETS:VER_TODOS', ['VER_TODOS']],
  ['TICKETS:ALTAS', ['ALTAS']],
  ['TICKETS:COMENTAR', ['COMENTAR']],
]);

/**
 * Acciones de una clave de API sobre un tipo de ticket (odd/permisos-por-tipo-ticket, D5 f, L50.3).
 * La clave no tiene filas en `permisos_tipo_ticket`: sus celdas (`PERMISOS_API`, más el
 * `TICKETS:VER_TODOS` que `ApiClaveGuard` agrega a una clave de lectura) se traducen con
 * `ACCIONES_POR_CELDA_DE_CLAVE`, solo sobre los tipos del módulo TICKETS. Un tipo de otro módulo
 * queda sin acciones.
 *
 * @param permisos Celdas del actor sintético de la clave, como códigos `MODULO:ACCION`.
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns Las acciones de la clave sobre ese tipo.
 */
export function accionesDeClaveApi(
  permisos: readonly string[],
  moduloDelTipo: string,
): Set<AccionTipoTicket> {
  const acciones = new Set<AccionTipoTicket>();
  if (moduloDelTipo !== MODULO_DE_LA_CLAVE) return acciones;
  for (const celda of permisos) {
    for (const accion of ACCIONES_POR_CELDA_DE_CLAVE.get(celda) ?? []) acciones.add(accion);
  }
  return acciones;
}

/**
 * Acciones de una clave para comentar un ticket del tipo. Es la única ampliación explícita sobre la
 * traducción de sus celdas: una clave con `COMENTAR` comenta cualquier ticket del tipo, sin regla de fila
 * (L18). Sin la ampliación, una clave de solo comentario (sin `LECTURA`, así que el guard no le
 * agrega `VER_TODOS`) no vería el ticket y quedaría limitada a los que pidió el usuario de
 * integración. La ampliación sirve solo para la operación de comentar.
 *
 * @param permisos Celdas del actor sintético de la clave, como códigos `MODULO:ACCION`.
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns Las acciones de la clave sobre ese tipo, con `LECTURA` y `VER_TODOS` si comenta.
 */
export function accionesDeClaveApiParaComentar(
  permisos: readonly string[],
  moduloDelTipo: string,
): Set<AccionTipoTicket> {
  const acciones = accionesDeClaveApi(permisos, moduloDelTipo);
  if (acciones.has('COMENTAR')) {
    acciones.add('LECTURA');
    acciones.add('VER_TODOS');
  }
  return acciones;
}
