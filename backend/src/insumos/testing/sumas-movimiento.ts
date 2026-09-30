import {
  CondicionStock,
  SumasPorCondicionYTipo,
  TipoMovimientoInsumo,
} from '../domain/entities/tipo-movimiento-insumo';

/** Sumas por tipo de una condición; los tipos que se omiten quedan en `0`. */
export type SumasParcialesPorTipo = Partial<Record<TipoMovimientoInsumo, number>>;

/**
 * Desglose de un insumo sin movimientos: las dos condiciones y los cuatro
 * tipos en `0`. Es lo que devuelve el repositorio real para un insumo sin
 * bitácora, así que los fakes de los specs lo usan como base.
 */
export function sumasEnCero(): SumasPorCondicionYTipo {
  return {
    NUEVO: { ENTRADA: 0, SALIDA: 0, AJUSTE_POSITIVO: 0, AJUSTE_NEGATIVO: 0 },
    USADO: { ENTRADA: 0, SALIDA: 0, AJUSTE_POSITIVO: 0, AJUSTE_NEGATIVO: 0 },
  };
}

/**
 * Desglose con los tipos indicados por condición y `0` en todo lo demás.
 *
 * @example sumasCon({ NUEVO: { ENTRADA: 10, SALIDA: 3 }, USADO: { ENTRADA: 2 } })
 */
export function sumasCon(
  parcial: Partial<Record<CondicionStock, SumasParcialesPorTipo>>,
): SumasPorCondicionYTipo {
  const base = sumasEnCero();
  return {
    NUEVO: { ...base.NUEVO, ...parcial.NUEVO },
    USADO: { ...base.USADO, ...parcial.USADO },
  };
}
