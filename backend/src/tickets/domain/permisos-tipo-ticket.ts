/**
 * Permisos por tipo de ticket (odd/tasks/permisos-por-tipo-ticket.md, S1, D4).
 *
 * El tipo de ticket es la unidad de permiso: cada usuario recibe, por tipo, un conjunto de
 * acciones. Se reusan los códigos del catálogo de la matriz master (`shared/domain/acciones.ts`)
 * para no inventar una segunda lengua de permisos.
 *
 * Fuente ÚNICA del vocabulario: el CHECK `permisos_tipo_ticket_accion_check` de la tabla del
 * tenant enumera estos mismos valores, y un test de integración compara las dos listas contra
 * `pg_get_constraintdef`.
 */
export const ACCIONES_TIPO_TICKET = [
  'LECTURA',
  'VER_TODOS',
  'ALTAS',
  'MODIFICACION',
  'TRANSICIONAR',
  'ASIGNAR',
  'COMENTAR',
  'OBSERVAR',
  'IMPRESION',
  'BORRADO',
] as const;

/** Código de una acción concedible sobre un tipo de ticket. */
export type AccionTipoTicket = (typeof ACCIONES_TIPO_TICKET)[number];

/** Módulo master cuyas celdas se leen para traducir a acciones por tipo. */
type ModuloOrigen = 'TICKETS' | 'EDILICIA';

/**
 * Tabla de traducción de L11: celda master (acción del módulo) → acciones por tipo.
 * Una acción del módulo que no figura acá no concede nada; en particular `EDILICIA:BORRADO`
 * (desvincular compra) sigue siendo permiso del módulo (L21), y Borrar nace vacío (S7).
 */
const TRADUCCION_L11: Readonly<
  Record<ModuloOrigen, Readonly<Record<string, readonly AccionTipoTicket[]>>>
> = {
  TICKETS: {
    LECTURA: ['LECTURA'],
    VER_TODOS: ['VER_TODOS'],
    ALTAS: ['ALTAS'],
    MODIFICACION: ['MODIFICACION'],
    TRANSICIONAR: ['TRANSICIONAR'],
    ASIGNAR: ['ASIGNAR'],
    COMENTAR: ['COMENTAR'],
    OBSERVAR: ['OBSERVAR'],
  },
  // Edilicia hoy no filtra por fila: su lectura equivale a ver todos. Su modificación cubre
  // también el cambio de estado y los comentarios, que el módulo no separa.
  EDILICIA: {
    LECTURA: ['LECTURA', 'VER_TODOS'],
    ALTAS: ['ALTAS'],
    MODIFICACION: ['MODIFICACION', 'TRANSICIONAR', 'COMENTAR'],
  },
};

/**
 * Módulo master del que toma las celdas un tipo, según su `modulo`. Los tipos de COMPRAS o
 * EQUIPOS se migran con la regla de TICKETS (L21). Un módulo fuera de la tabla no tiene origen:
 * el tipo queda cerrado, igual que un tipo nuevo (S4).
 */
const ORIGEN_POR_MODULO_DEL_TIPO: Readonly<Record<string, ModuloOrigen>> = {
  TICKETS: 'TICKETS',
  COMPRAS: 'TICKETS',
  EQUIPOS: 'TICKETS',
  EDILICIA: 'EDILICIA',
};

/**
 * Traduce las celdas master de un usuario a las acciones que tiene sobre un tipo de ticket,
 * según la tabla de L11. Es la única implementación de esa tabla: la usan el backfill, las
 * plantillas de rol y los tests (D4).
 *
 * Imprimir se concede a quien resulte con Ver; Borrar no se concede nunca. Las celdas de un
 * módulo distinto del origen del tipo no cuentan.
 *
 * @param celdas Celdas de la matriz master del usuario, como códigos `MODULO:ACCION`.
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns El conjunto de acciones concedidas sobre ese tipo; vacío si no corresponde ninguna.
 */
export function accionesDeTipoDesdeCeldas(
  celdas: readonly string[],
  moduloDelTipo: string,
): Set<AccionTipoTicket> {
  const acciones = new Set<AccionTipoTicket>();
  const origen: ModuloOrigen | undefined = ORIGEN_POR_MODULO_DEL_TIPO[moduloDelTipo];
  if (origen === undefined) return acciones;
  // Un tipo de COMPRAS o EQUIPOS toma las celdas de TICKETS, pero hoy (S0) solo lo ve quien tiene
  // alguna celda de su propio módulo: sin ella, la migración no puede darle acceso (S7).
  if (origen !== moduloDelTipo && !celdas.some((celda) => celda.startsWith(`${moduloDelTipo}:`))) {
    return acciones;
  }

  const traduccion = TRADUCCION_L11[origen];
  const prefijo = `${origen}:`;
  for (const celda of celdas) {
    if (!celda.startsWith(prefijo)) continue;
    const concedidas = traduccion[celda.slice(prefijo.length)] ?? [];
    for (const accion of concedidas) acciones.add(accion);
  }

  if (acciones.has('LECTURA')) acciones.add('IMPRESION');
  return acciones;
}
