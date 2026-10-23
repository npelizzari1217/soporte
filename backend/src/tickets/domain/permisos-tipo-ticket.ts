import { esModuloValido, Modulo } from '../../shared/domain/modulos';

/**
 * Permisos por tipo de ticket (odd/tasks/permisos-por-tipo-ticket.md, S1, D4).
 *
 * El tipo de ticket es la unidad de permiso: cada usuario recibe, por tipo, un conjunto de
 * acciones. Se reusan los códigos que tenía el módulo TICKETS en la matriz master (que desde T9b
 * ya no lo tiene) para no inventar una segunda lengua de permisos.
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
