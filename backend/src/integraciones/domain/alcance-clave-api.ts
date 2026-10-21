import {
  AccionTipoTicket,
  accionesDeTipoDesdeCeldas,
} from '../../tickets/domain/permisos-tipo-ticket';

/**
 * Acciones de una clave de API sobre un tipo de ticket (odd/permisos-por-tipo-ticket, D4, D5 f).
 * La clave no tiene filas en `permisos_tipo_ticket`: sus celdas (`PERMISOS_API`, más el
 * `TICKETS:VER_TODOS` que `ApiClaveGuard` agrega a una clave de lectura) se traducen con la tabla
 * de L11, la misma que usan el backfill y las plantillas de rol. Un tipo de otro módulo que el de
 * las celdas queda sin acciones.
 *
 * @param permisos Celdas del actor sintético de la clave, como códigos `MODULO:ACCION`.
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns Las acciones de la clave sobre ese tipo.
 */
export function accionesDeClaveApi(
  permisos: readonly string[],
  moduloDelTipo: string,
): Set<AccionTipoTicket> {
  return accionesDeTipoDesdeCeldas(permisos, moduloDelTipo);
}

/**
 * Acciones de una clave para comentar un ticket del tipo. Es la única ampliación explícita sobre la
 * traducción de L11: una clave con `COMENTAR` comenta cualquier ticket del tipo, sin regla de fila
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
