/**
 * Catálogo CERRADO de tipos de movimiento de stock de un insumo.
 *
 * Los cuatro son excluyentes y describen POR QUÉ cambió la existencia:
 * `ENTRADA` suma, `SALIDA` resta, y los dos `AJUSTE_*` corrigen un desvío
 * contra el conteo físico, cada uno en su dirección. La dirección la deriva
 * quien suma la bitácora — ver `movimientos_insumo.cantidad`, que va siempre
 * positiva (`CHECK (cantidad > 0)`).
 *
 * El ajuste está partido en dos y no es un solo valor: con `cantidad` siempre
 * positiva, un `AJUSTE` único jamás podría RESTAR, y asentar un faltante
 * sería imposible.
 *
 * **Es un array y no solo una unión, y es la ÚNICA fuente de verdad**: el
 * tipo se deriva de acá, no al revés. Una unión de TypeScript se borra al
 * compilar, así que sin esta constante no hay nada que un test pueda
 * comparar contra la base. Mismo criterio que `TIPOS_OPERACION_COMPRA`
 * (`compras/domain/ports/i-operacion-compra.repository.ts`).
 *
 * Agregar un tipo acá SIN su migración hace que el INSERT lo rechace el
 * CHECK `movimientos_insumo_tipo_check`; como no hay filtro global de
 * excepciones, eso sale como 500. Esa deriva la ataja
 * `infrastructure/persistence/prisma/movimientos-insumo-constraints.integration.spec.ts`,
 * que lee la definición real del CHECK con `pg_get_constraintdef` y la
 * compara contra este array.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 4.
 */
export const TIPOS_MOVIMIENTO_INSUMO = [
  'ENTRADA',
  'SALIDA',
  'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO',
] as const;

/**
 * Los dos tipos de AJUSTE, que son la misma operación de negocio con distinto
 * signo. Existen separados y no como un único `AJUSTE` porque `cantidad` es
 * siempre positiva y la dirección la da el tipo: con un solo valor, un ajuste
 * jamás podría RESTAR, y asentar "el conteo físico dio tres menos" sería
 * imposible.
 *
 * Se exporta para que el gate de autorización (`INSUMOS:AJUSTAR`) y la regla
 * del motivo obligatorio se apliquen a los dos sin enumerarlos a mano en cada
 * lugar, que es como se desincronizan.
 */
export const TIPOS_AJUSTE_INSUMO = ['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'] as const;

/** Un tipo de ajuste, derivado de `TIPOS_AJUSTE_INSUMO`. */
export type TipoAjusteInsumo = (typeof TIPOS_AJUSTE_INSUMO)[number];

/**
 * @param tipo Tipo de movimiento a clasificar.
 * @returns `true` si el movimiento es un ajuste, en cualquiera de sus dos direcciones.
 */
export function esAjuste(tipo: TipoMovimientoInsumo): tipo is TipoAjusteInsumo {
  return (TIPOS_AJUSTE_INSUMO as readonly string[]).includes(tipo);
}

/** Tipo de un movimiento de stock, derivado de `TIPOS_MOVIMIENTO_INSUMO`. */
export type TipoMovimientoInsumo = (typeof TIPOS_MOVIMIENTO_INSUMO)[number];
