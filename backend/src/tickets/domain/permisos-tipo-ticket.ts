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

/**
 * ¿El valor es una acción del vocabulario?
 *
 * @param valor Texto recibido (por ejemplo, del cuerpo de un request).
 * @returns `true` si es un `AccionTipoTicket`.
 */
export function esAccionTipoTicket(valor: string): valor is AccionTipoTicket {
  const vocabulario: readonly string[] = ACCIONES_TIPO_TICKET;
  return vocabulario.includes(valor);
}

/**
 * Acciones que un administrador puede conceder desde Permisos (S5). `BORRADO` queda afuera: borrar
 * un ticket todavía no existe (S8, T10) y conceder un permiso sin operación detrás sería un control
 * sin efecto. Cuando exista el borrado, se suma acá.
 */
export const ACCIONES_TIPO_TICKET_CONCEDIBLES: readonly AccionTipoTicket[] =
  ACCIONES_TIPO_TICKET.filter((accion) => accion !== 'BORRADO');

/**
 * Motivo por el que una fila (las acciones de un usuario sobre un tipo) no se puede guardar, o
 * `null` si es válida. Sin Ver, el resto de la fila queda deshabilitado (S3): ninguna otra acción
 * se concede sin `LECTURA`.
 *
 * @param acciones Acciones pedidas para el tipo.
 * @returns Las acciones que no se pueden conceder y por qué, o `null`.
 */
export function problemaDeFilaDeTipo(
  acciones: readonly string[],
): { tipo: 'desconocida' | 'no-concedible' | 'sin-ver'; acciones: string[] } | null {
  const desconocidas = acciones.filter((accion) => !esAccionTipoTicket(accion));
  if (desconocidas.length > 0) return { tipo: 'desconocida', acciones: desconocidas };
  const concedibles: readonly string[] = ACCIONES_TIPO_TICKET_CONCEDIBLES;
  const noConcedibles = acciones.filter((accion) => !concedibles.includes(accion));
  if (noConcedibles.length > 0) return { tipo: 'no-concedible', acciones: noConcedibles };
  if (acciones.length > 0 && !acciones.includes('LECTURA')) {
    return { tipo: 'sin-ver', acciones: [...acciones] };
  }
  return null;
}

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
 * ¿El tipo toma sus acciones de las celdas `TICKETS:*`? Es así para los tipos de TICKETS, COMPRAS y
 * EQUIPOS (L21). Permite reconstruir qué celda originó una acción: un `VER_TODOS` sobre estos tipos
 * viene de `TICKETS:VER_TODOS`; sobre uno de EDILICIA, de `EDILICIA:LECTURA` (L11).
 *
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns `true` si el origen de sus acciones son las celdas de TICKETS.
 */
export function tomaCeldasDeTickets(moduloDelTipo: string): boolean {
  return ORIGEN_POR_MODULO_DEL_TIPO[moduloDelTipo] === 'TICKETS';
}

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

/**
 * ¿La celda master ya no decide nada porque pasó a la tabla por tipo? Son las celdas que traduce
 * L11: todas las de TICKETS y `EDILICIA:LECTURA`, `ALTAS` y `MODIFICACION`. `EDILICIA:BORRADO`
 * (desvincular compra) sigue siendo del módulo (L21). Desde T7 la grilla de módulos deja de
 * editarlas (D5 d); se retiran de la base en T9.
 *
 * @param celda Código `MODULO:ACCION`.
 * @returns `true` si la celda la reemplazan los permisos por tipo.
 */
export function celdaReemplazadaPorTipo(celda: string): boolean {
  const [modulo, accion] = celda.split(':');
  if (modulo !== 'TICKETS' && modulo !== 'EDILICIA') return false;
  return accion !== undefined && Object.keys(TRADUCCION_L11[modulo]).includes(accion);
}

/** Un tipo de ticket como destino de permisos: su id y el módulo del que toma las celdas. */
export interface TipoTicketConModulo {
  id: string;
  modulo: string;
}

/**
 * Traduce un conjunto de celdas master (por ejemplo, la plantilla de un rol) a las filas por tipo
 * de todos los tipos dados, con la tabla de L11 de `accionesDeTipoDesdeCeldas`.
 *
 * @param celdas Celdas de la matriz master, como códigos `MODULO:ACCION`.
 * @param tipos Tipos de ticket del tenant que reciben permisos.
 * @returns Pares (tipo, acción) concedidos; vacío si las celdas no conceden nada sobre tickets.
 */
export function filasDeTiposDesdeCeldas(
  celdas: readonly string[],
  tipos: readonly TipoTicketConModulo[],
): { tipoId: string; accion: AccionTipoTicket }[] {
  return tipos.flatMap((tipo) =>
    [...accionesDeTipoDesdeCeldas(celdas, tipo.modulo)].map((accion) => ({
      tipoId: tipo.id,
      accion,
    })),
  );
}
