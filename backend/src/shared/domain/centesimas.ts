/**
 * Convierte una cantidad o un monto a centésimas ENTERAS y redondeadas —
 * ADR-C3.
 *
 * Por qué: JavaScript representa las fracciones decimales en binario IEEE-754,
 * así que operaciones tan simples como `0.7 - 0.6` dan `0.09999999999999998`
 * en vez de `0.1` (undershoot); comparar ese resultado con `>=` contra `0.1`
 * en punto flotante directo da un falso negativo. `0.1 + 0.2` produce el error
 * simétrico (`0.30000000000000004`, overshoot), que en una comparación `>=`
 * puede pasar desapercibido por casualidad pero NO es confiable. La única
 * forma de comparar y sumar sin depender de hacia qué lado redondeó el float
 * es hacerlo en una escala entera.
 *
 * `Math.round` y no `Math.floor` ni truncado: el truncado introduciría un
 * sesgo sistemático hacia abajo en el propio redondeo a centésimas.
 *
 * **Vive en `shared/domain/` y no en `compras/` porque está por tener un
 * SEGUNDO dueño con la misma regla y consecuencias distintas**: hoy compras
 * decide plata con ella —qué ítem está comprado, cuál entregado, el monto
 * total— y el módulo de insumos la necesita para decidir si una salida de
 * stock se autoriza en el límite exacto.
 *
 * Es una extracción PREVENTIVA, no una deduplicación: al momento de moverla
 * había una sola implementación, la de compras. Se saca antes de que aparezca
 * la segunda porque la alternativa —que insumos la importe de compras— no
 * está disponible: la Entrega 3 agrega `ItemCompra.insumoId`, o sea
 * `compras → insumos`, y el import inverso cerraría un ciclo entre los dos
 * módulos. Un lugar neutral es el único del que los dos pueden depender sin
 * depender entre sí.
 *
 * Las columnas involucradas son todas `DECIMAL(_, 2)`, así que la centésima es
 * la unidad indivisible y este redondeo no pierde información.
 *
 * @param n Valor en unidades normales (por ejemplo `cantidad = 0.3`, `monto = 150000.5`).
 * @returns El mismo valor expresado en centésimas enteras.
 */
export function enCentesimas(n: number): number {
  return Math.round(n * 100);
}
