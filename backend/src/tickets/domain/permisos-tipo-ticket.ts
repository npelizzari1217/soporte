import { esModuloValido, Modulo } from '../../shared/domain/modulos';

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
 * Motivo por el que una fila (las acciones de un usuario sobre un tipo) no se puede guardar, o
 * `null` si es válida. Todas las acciones del vocabulario se conceden desde Permisos (S5), Borrar
 * incluida desde que existe el borrado (S8). Sin Ver, el resto de la fila queda deshabilitado (S3):
 * ninguna otra acción se concede sin `LECTURA`.
 *
 * @param acciones Acciones pedidas para el tipo.
 * @returns Las acciones que no se pueden conceder y por qué, o `null`.
 */
export function problemaDeFilaDeTipo(
  acciones: readonly string[],
): { tipo: 'desconocida' | 'sin-ver'; acciones: string[] } | null {
  const desconocidas = acciones.filter((accion) => !esAccionTipoTicket(accion));
  if (desconocidas.length > 0) return { tipo: 'desconocida', acciones: desconocidas };
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
  // La lectura de Edilicia da solo Ver: Ver todos sobre un tipo de Edilicia sale de
  // `TICKETS:VER_TODOS` (L35). Su modificación cubre también el cambio de estado y los
  // comentarios, que el módulo no separa.
  EDILICIA: {
    LECTURA: ['LECTURA'],
    ALTAS: ['ALTAS'],
    MODIFICACION: ['MODIFICACION', 'TRANSICIONAR', 'COMENTAR'],
  },
};

/**
 * Módulos master de los que toma las celdas un tipo, según su `modulo`. Los tipos de COMPRAS o
 * EQUIPOS se migran con la regla de TICKETS (L21). Los de EDILICIA suman a las suyas las de
 * TICKETS (L35): comentar, asignar, notas internas y ver todos sobre un ticket edilicio salían de
 * `TICKETS:*`. Un módulo fuera de la tabla no tiene origen: el tipo queda cerrado, igual que un
 * tipo nuevo (S4).
 */
const ORIGENES_POR_MODULO_DEL_TIPO: Readonly<Record<string, readonly ModuloOrigen[]>> = {
  TICKETS: ['TICKETS'],
  COMPRAS: ['TICKETS'],
  EQUIPOS: ['TICKETS'],
  EDILICIA: ['TICKETS', 'EDILICIA'],
};

/**
 * Traduce las celdas master de un usuario a las acciones que tiene sobre un tipo de ticket,
 * según la tabla de L11. Es la única implementación de esa tabla. Desde T9a las plantillas de rol
 * ya no salen de acá (son explícitas, `PlantillaPorTipo`): la usa solo el backfill del paso 8c
 * (`scripts/backfill-permisos-tipo-ticket.mjs`, que la lee de `dist/`), y se retira con él en T9c.
 *
 * Imprimir se concede a quien resulte con Ver; Borrar no se concede nunca. Las celdas de un
 * módulo que no es origen del tipo no cuentan. Con varios orígenes, el resultado es la unión.
 * Un tipo que no es de TICKETS pero toma sus celdas (COMPRAS y EQUIPOS por L23, EDILICIA por L35)
 * no da nada a quien no tiene ninguna celda del módulo del tipo.
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
  const origenes = ORIGENES_POR_MODULO_DEL_TIPO[moduloDelTipo];
  if (origenes === undefined) return acciones;
  // Un tipo de COMPRAS, EQUIPOS o EDILICIA toma las celdas de TICKETS, pero hoy (S0) solo lo ve
  // quien tiene alguna celda de su propio módulo: sin ella, la migración no puede darle acceso (S7).
  if (
    origenes.some((origen) => origen !== moduloDelTipo) &&
    !celdas.some((celda) => celda.startsWith(`${moduloDelTipo}:`))
  ) {
    return acciones;
  }

  for (const origen of origenes) {
    const traduccion = TRADUCCION_L11[origen];
    const prefijo = `${origen}:`;
    for (const celda of celdas) {
      if (!celda.startsWith(prefijo)) continue;
      const concedidas = traduccion[celda.slice(prefijo.length)] ?? [];
      for (const accion of concedidas) acciones.add(accion);
    }
  }

  if (acciones.has('LECTURA')) acciones.add('IMPRESION');
  return acciones;
}

/**
 * ¿La celda master ya no decide nada porque pasó a la tabla por tipo? Son las celdas que traduce
 * L11: todas las de TICKETS y `EDILICIA:LECTURA`, `ALTAS` y `MODIFICACION`. `EDILICIA:BORRADO`
 * (desvincular compra) sigue siendo del módulo (L21). Desde T7 la grilla de módulos deja de
 * editarlas (D5 d) y desde T9a las plantillas de rol no las traen; se retiran de la base en T9b.
 *
 * @param celda Código `MODULO:ACCION`.
 * @returns `true` si la celda la reemplazan los permisos por tipo.
 */
export function celdaReemplazadaPorTipo(celda: string): boolean {
  const [modulo, accion] = celda.split(':');
  if (modulo !== 'TICKETS' && modulo !== 'EDILICIA') return false;
  return accion !== undefined && Object.keys(TRADUCCION_L11[modulo]).includes(accion);
}

/** Un tipo de ticket como destino de permisos: su id y su módulo (`tipos_ticket.modulo`). */
export interface TipoTicketConModulo {
  id: string;
  modulo: string;
}

/**
 * Tipos sobre los que escribe la plantilla de un rol (W3 del judgment-day de la etapa 1, S4). Un
 * tipo nuevo nace cerrado y la plantilla no lo abre: solo cuentan los tipos sobre los que algún
 * usuario ya tiene Ver, porque los abrió una copia o un administrador (sin Ver no hay nada, S3).
 * Si nadie tiene Ver en ningún tipo, el tenant todavía no usa el modelo por tipo (tenant nuevo o
 * anterior al backfill de S7) y la plantilla vale para todos, como en la migración.
 *
 * @param tipos Todos los tipos del tenant que reciben permisos.
 * @param tiposConVer Ids de los tipos sobre los que algún usuario tiene `LECTURA`.
 * @returns Los tipos abiertos para la plantilla, en el orden recibido.
 */
export function tiposAbiertosParaPlantilla<T extends TipoTicketConModulo>(
  tipos: readonly T[],
  tiposConVer: ReadonlySet<string>,
): T[] {
  if (tiposConVer.size === 0) return [...tipos];
  return tipos.filter((tipo) => tiposConVer.has(tipo.id));
}

/**
 * Plantilla de permisos por tipo de un rol (T9a, L50.4): las acciones que concede sobre un tipo de
 * ticket según el módulo de ese tipo. Declara todos los módulos de `MODULOS`, así que sumar un
 * módulo obliga a decidir qué da cada rol sobre sus tipos.
 */
export type PlantillaPorTipo = Readonly<Record<Modulo, readonly AccionTipoTicket[]>>;

/**
 * Acciones que una plantilla de rol da sobre un tipo de ticket.
 *
 * @param plantilla Plantilla por tipo del rol.
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns Las acciones de la plantilla para ese módulo; ninguna si el módulo no es uno de
 *   `MODULOS` (el tipo queda cerrado, como uno nuevo, S4).
 */
export function accionesDePlantilla(
  plantilla: PlantillaPorTipo,
  moduloDelTipo: string,
): readonly AccionTipoTicket[] {
  return esModuloValido(moduloDelTipo) ? plantilla[moduloDelTipo] : [];
}

/**
 * Filas por tipo que escribe la plantilla de un rol sobre los tipos dados.
 *
 * @param plantilla Plantilla por tipo del rol.
 * @param tipos Tipos de ticket del tenant que reciben permisos.
 * @returns Pares (tipo, acción) concedidos; vacío si la plantilla no concede nada (ADMINISTRADOR).
 */
export function filasDeTiposDesdePlantilla(
  plantilla: PlantillaPorTipo,
  tipos: readonly TipoTicketConModulo[],
): { tipoId: string; accion: AccionTipoTicket }[] {
  return tipos.flatMap((tipo) =>
    accionesDePlantilla(plantilla, tipo.modulo).map((accion) => ({ tipoId: tipo.id, accion })),
  );
}
