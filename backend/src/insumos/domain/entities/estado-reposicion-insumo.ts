import { enCentesimas } from '../../../shared/domain/centesimas';

/**
 * Catálogo CERRADO de estados de reposición de un insumo: cómo se lee su
 * existencia actual contra el punto de reposición que tenga configurado.
 *
 * **Son TRES y no un booleano, y esa es la decisión.** `insumos.stock_minimo`
 * es `number | null`, y `null` significa "este insumo no tiene punto de
 * reposición definido" —lo dice el JSDoc de `InsumoProps.stockMinimo`—, que NO
 * es lo mismo que cero. Con un booleano, ese `null` tendría que resolverse
 * como `false`, y entonces "nadie le configuró un punto" y "tiene punto y está
 * por encima" quedarían indistinguibles para quien consuma el indicador: la
 * ficha mostraría el mismo cartel tranquilizador en los dos casos y el
 * administrador nunca se enteraría de cuáles insumos le falta configurar.
 * Un tercer valor con nombre propio es lo que hace visible esa diferencia
 * —también en el borde HTTP, donde un `false` y un `null` de JSON se leen los
 * dos como "no pasa nada".
 *
 * No hay CHECK de base detrás de estos valores: no se persisten, se DERIVAN en
 * cada consulta a partir del saldo y del punto de reposición.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, unidad 7.
 */
export const ESTADOS_REPOSICION_INSUMO = [
  'SIN_PUNTO_DEFINIDO',
  'SUFICIENTE',
  'BAJO_MINIMO',
] as const;

/** Estado de reposición de un insumo, derivado de `ESTADOS_REPOSICION_INSUMO`. */
export type EstadoReposicionInsumo = (typeof ESTADOS_REPOSICION_INSUMO)[number];

/**
 * Clasifica la existencia de un insumo contra su punto de reposición.
 *
 * **El corte es `stock <= stockMinimo`, y avisa AL LLEGAR al punto, no después
 * de perforarlo.** `stock_minimo` es el PUNTO DE REPOSICIÓN: el nivel en el
 * que corresponde reponer, no el piso que ya se rompió. Con `<`, el aviso
 * llegaría recién cuando el saldo está por debajo del nivel que el usuario
 * pidió sostener, o sea siempre tarde.
 *
 * El caso que lo decide sin margen de opinión es el punto en CERO, que es un
 * valor legal —`INSUMO_STOCK_MINIMO_MINIMO` es 0 y el CHECK de la columna lo
 * admite— y significa "avisar cuando se acabe". Con `<`, `0 < 0` es falso y el
 * aviso nunca llegaría: el registro de salidas impide que el saldo baje de
 * cero, así que `stock < 0` es inalcanzable por el camino normal y ese punto
 * de reposición quedaría configurado pero muerto.
 *
 * La comparación va en centésimas ENTERAS (`enCentesimas`) y no en punto
 * flotante directo, por el mismo motivo que `calcularStock`: un saldo que vale
 * exactamente lo mismo que el punto de reposición puede llegar como
 * `0.30000000000000004` y quedar del lado equivocado de un `<=` crudo. Las dos
 * columnas son `DECIMAL(_, 2)`, así que la centésima es la unidad indivisible
 * y la escala entera no pierde nada.
 *
 * @param stock Existencia actual, tal como la devuelve `calcularStock`. Puede ser negativa.
 * @param stockMinimo Punto de reposición del insumo, o `null` si no tiene uno definido.
 * @returns `SIN_PUNTO_DEFINIDO` si el insumo no tiene punto; si lo tiene,
 *   `BAJO_MINIMO` cuando el saldo llegó o bajó del punto, y `SUFICIENTE` en
 *   cualquier otro caso.
 */
export function evaluarReposicion(
  stock: number,
  stockMinimo: number | null,
): EstadoReposicionInsumo {
  if (stockMinimo === null) {
    return 'SIN_PUNTO_DEFINIDO';
  }

  return enCentesimas(stock) <= enCentesimas(stockMinimo) ? 'BAJO_MINIMO' : 'SUFICIENTE';
}
