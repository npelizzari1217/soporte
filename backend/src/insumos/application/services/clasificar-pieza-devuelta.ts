import {
  SeguimientoInsumo,
  UNIDAD_SERIAL_MAX_LENGTH,
  normalizarSerial,
} from '../../domain/entities/unidad-insumo.entity';

/**
 * Causas por las que una pieza activa de un equipo no puede volver al depósito
 * en la baja con destino `STOCK_USADO`. Es el vocabulario común del resumen
 * previo (sin locks) y de la baja (bajo L1 y L2).
 */
export const CAUSAS_PIEZA_NO_DEVOLVIBLE = [
  'INSUMO_BORRADO',
  'FAMILIA_NO_REPUESTO',
  'SERIAL_REQUERIDO',
  'SERIAL_INVALIDO',
  'SERIAL_REPETIDO',
  'SERIAL_DUPLICADO',
] as const;

export type CausaPiezaNoDevolvible = (typeof CAUSAS_PIEZA_NO_DEVOLVIBLE)[number];

/** Una pieza con la causa que le impide volver al depósito. */
export interface CausaPieza {
  componenteId: string;
  insumoId: string | null;
  causa: CausaPiezaNoDevolvible;
}

/**
 * Hechos de una pieza, ya leídos por el llamador. La función no hace I/O: la
 * lectura (con lock o sin él) es decisión de quien la invoca.
 */
export interface PiezaParaClasificar {
  destino: 'STOCK_USADO' | 'DESCARTE';
  /** `null` si la pieza no tiene insumo (componente sin catálogo). */
  insumoId: string | null;
  /** `false` si el insumo no existe o tiene baja lógica. Un insumo deshabilitado SÍ es vigente. */
  insumoVigente: boolean;
  /** `esRepuesto` de la familia del insumo; `null` si la familia no existe. La baja lógica o el deshabilitado de la familia se admiten. */
  familiaEsRepuesto: boolean | null;
  seguimiento: SeguimientoInsumo;
  /** `true` si el componente ya lleva una unidad: el serial lo resuelve la unidad. */
  tieneUnidad: boolean;
  /** Serial de texto del componente legado. */
  numeroSerie: string | null;
  /** `true` si otra pieza del mismo insumo y lote trae el mismo serial normalizado. */
  serialRepetidoEnElLote: boolean;
}

/**
 * Clasifica UNA pieza. Devuelve la causa que le impide volver al depósito, o
 * `null` si puede. Solo el destino `STOCK_USADO` devuelve piezas: con `DESCARTE`
 * ninguna causa aplica (el insumo borrado no frena un descarte).
 *
 * `SERIAL_DUPLICADO` no sale de acá: exige consultar la base y la decide quien
 * la consulta, bajo L2.
 */
export function clasificarPiezaDevuelta(pieza: PiezaParaClasificar): CausaPiezaNoDevolvible | null {
  if (pieza.destino === 'DESCARTE') return null;
  // Una pieza sin insumo no toca stock: no hay nada que devolver ni que validar.
  if (pieza.insumoId === null) return null;

  if (!pieza.insumoVigente) return 'INSUMO_BORRADO';
  if (pieza.familiaEsRepuesto !== true) return 'FAMILIA_NO_REPUESTO';

  // Solo el legado de un insumo SERIE (sin unidad) necesita un serial de texto válido.
  if (pieza.seguimiento !== 'SERIE' || pieza.tieneUnidad) return null;

  const numeroSerie = pieza.numeroSerie?.trim() ?? '';
  const normalizado = normalizarSerial(numeroSerie);
  if (normalizado === '') return 'SERIAL_REQUERIDO';
  if (
    numeroSerie.length > UNIDAD_SERIAL_MAX_LENGTH ||
    normalizado.length > UNIDAD_SERIAL_MAX_LENGTH
  ) {
    return 'SERIAL_INVALIDO';
  }
  if (pieza.serialRepetidoEnElLote) return 'SERIAL_REPETIDO';
  return null;
}
