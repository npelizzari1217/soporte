import { enCentesimas } from '../../../shared/domain/centesimas';

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

/**
 * En qué DIRECCIÓN pesa cada tipo sobre la existencia: `1` suma al depósito,
 * `-1` resta.
 *
 * Vive en el dominio y no en el repositorio a propósito. El puerto devuelve el
 * desglose crudo —`SUM(cantidad) GROUP BY tipo`, sin interpretar ningún
 * tipo— justamente porque la dirección es una regla de NEGOCIO: la persistencia
 * no puede fijarla sin volverse dueña de algo que después habría que cambiar
 * tocando SQL. Y vive en ESTE archivo, junto al catálogo que indexa, por dos
 * motivos concretos:
 *
 * 1. **La garantía del compilador solo funciona acá.** Es un
 *    `Record<TipoMovimientoInsumo, …>`, así que agregar un valor a
 *    `TIPOS_MOVIMIENTO_INSUMO` sin darle dirección NO compila. Esa red sirve
 *    únicamente si quien agrega el tipo abre el archivo donde está: en un
 *    archivo aparte, el error aparecería lejos de la edición que lo causó.
 *    Es lo que hace innecesario —y prohibido— un `if` que enumere los cuatro
 *    tipos a mano, que es la forma exacta en que un quinto tipo entra sin
 *    signo y desaparece del saldo en silencio.
 * 2. Es el mismo corte que ya usa `TIPOS_AJUSTE_INSUMO` con `esAjuste()`: el
 *    dato derivado del catálogo y la función que lo lee viven con el catálogo.
 *
 * `AJUSTE_POSITIVO` suma y `AJUSTE_NEGATIVO` resta porque `cantidad` es
 * siempre positiva y la dirección la da el tipo (decisión 4 del diseño).
 */
export const DIRECCION_POR_TIPO_MOVIMIENTO: Readonly<Record<TipoMovimientoInsumo, 1 | -1>> = {
  ENTRADA: 1,
  SALIDA: -1,
  AJUSTE_POSITIVO: 1,
  AJUSTE_NEGATIVO: -1,
};

/**
 * Deriva el STOCK de un insumo a partir del desglose de su bitácora por tipo:
 * `ENTRADA + AJUSTE_POSITIVO − SALIDA − AJUSTE_NEGATIVO`.
 *
 * Es la ÚNICA fórmula del saldo del sistema, y por eso es una función
 * exportada y no tres líneas dentro de un caso de uso. La usan el registro de
 * una salida —que decide bajo el advisory lock si hay con qué— y la consulta
 * de stock que se muestra en la ficha del insumo: dos copias de la misma
 * fórmula discreparían el día que entre un tipo nuevo, y el sistema mostraría
 * un número distinto del que autoriza.
 *
 * La fórmula NO enumera los tipos: recorre el catálogo y le pregunta la
 * dirección a `DIRECCION_POR_TIPO_MOVIMIENTO`, así que un tipo nuevo entra al
 * saldo por construcción —o no compila, si nadie le asignó dirección—.
 *
 * @param sumasPorTipo Desglose crudo de la bitácora, con los cuatro tipos
 *   presentes y `0` en los que no tienen movimientos: exactamente lo que
 *   devuelve `IMovimientoInsumoRepository.lockAndSumByTipo`.
 * @returns El stock resultante, con los dos decimales de la columna. Puede ser
 *   negativo si la bitácora ya quedó en negativo por una escritura que no pasó
 *   por la sección crítica; se devuelve tal cual en vez de recortarlo a cero,
 *   porque esconder el negativo dejaría el desvío sin nadie que lo note.
 */
export function calcularStock(
  sumasPorTipo: Readonly<Record<TipoMovimientoInsumo, number>>,
): number {
  const saldoEnCentesimas = TIPOS_MOVIMIENTO_INSUMO.reduce(
    (acumulado, tipo) =>
      acumulado + DIRECCION_POR_TIPO_MOVIMIENTO[tipo] * enCentesimas(sumasPorTipo[tipo]),
    0,
  );

  return saldoEnCentesimas / 100;
}
