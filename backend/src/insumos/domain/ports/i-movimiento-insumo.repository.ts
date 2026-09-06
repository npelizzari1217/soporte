import { MovimientoInsumoEntity } from '../entities/movimiento-insumo.entity';
import { TipoMovimientoInsumo } from '../entities/tipo-movimiento-insumo';

/**
 * SumasPorTipoMovimiento — cuánto suma la bitácora de un insumo en CADA tipo
 * del catálogo, sin interpretar ninguno.
 *
 * Es deliberadamente un desglose y no un saldo: el repositorio devuelve el
 * dato crudo —`SUM(cantidad) GROUP BY tipo`— y NO decide en qué dirección
 * pesa cada tipo. Esa regla es de negocio y no le corresponde a la capa de
 * persistencia fijarla de hecho: un repositorio que devolviera un solo número
 * ya la habría tomado, y cambiarla después obligaría a tocar SQL en vez de una
 * regla. El catálogo ya pasó una vez de tres tipos a cuatro —el ajuste se
 * partió en `AJUSTE_POSITIVO` y `AJUSTE_NEGATIVO` (decisión 4)—, y esa
 * corrección no tocó esta firma: es la prueba de que el desglose es el lugar
 * correcto para el corte.
 *
 * Todos los tipos están presentes, con `0` cuando no hay filas: un `GROUP BY`
 * no emite filas vacías, así que la implementación completa los faltantes para
 * que el consumidor no tenga que resolver una ausencia como cero cada vez.
 */
export type SumasPorTipoMovimiento = Readonly<Record<TipoMovimientoInsumo, number>>;

/**
 * IMovimientoInsumoRepository — puerto de persistencia de la bitácora de
 * existencias de los insumos del tenant.
 *
 * **APPEND-ONLY GARANTIZADO POR LA FIRMA**: el único método de escritura es
 * `insert()`. No hay `update`, `delete`, `save` ni `guardar` — no es una
 * convención de nombres a respetar, es que el método físicamente no existe en
 * esta interfaz. Mismo criterio que `IOperacionCompraRepository` (S37) y
 * `IComentarioReparacionRepository`. La tabla lo acompaña estructuralmente:
 * `movimientos_insumo` no tiene `updated_at` ni `deleted_at`, así que el
 * `softDelete()` que `MovimientoInsumoEntity` hereda de `BaseEntity` no tiene
 * por dónde llegar a la base.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta obtiene su cliente vía `TenantContext.getClient()`.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisiones 1 y 4.
 */
export interface IMovimientoInsumoRepository {
  /**
   * Asienta un movimiento nuevo. Solo INSERT — nunca hay UPDATE de una fila ya
   * escrita.
   *
   * Va SIEMPRE dentro de la misma transacción
   * (`ITenantTransactionRunner.run(...)`) que el `lockAndSumByTipo()` que
   * decidió que el movimiento era admisible. Fuera de ella el lock ya se
   * liberó y la comprobación de stock no vale nada: ver `lockAndSumByTipo()`.
   */
  insert(movimiento: MovimientoInsumoEntity): Promise<void>;

  /**
   * Toma el advisory lock transaccional del insumo y devuelve el desglose de
   * su bitácora por tipo, en UNA consulta agregada — no trae las filas.
   *
   * **CRÍTICO — el lock SOLO sirve si esta llamada y el `insert()`
   * subsiguiente corren DENTRO de la MISMA transacción**
   * (`ITenantTransactionRunner.run(...)`). Invocado fuera de una transacción
   * explícita, Postgres abre una transacción implícita de una sola sentencia:
   * `pg_advisory_xact_lock` se adquiere y se libera de inmediato, sin ningún
   * efecto de serialización, y dos salidas simultáneas del mismo insumo verían
   * las MISMAS sumas y ambas pasarían. Mismo contrato y mismo riesgo que
   * `ICompraRepository.findLastSecuencia`.
   *
   * El lock es por INSUMO (`hashtext('insumo-stock:' + insumoId)`), así que
   * serializa solo a los escritores del mismo insumo: dos técnicos sacando
   * cosas distintas no se esperan entre sí.
   *
   * **Límite conocido, dicho y no escondido**: Postgres no puede expresar
   * `SUM(cantidad) >= 0` sobre varias filas, así que NO hay backstop de base
   * contra el stock negativo. La invariante depende de que toda escritura pase
   * por este único punto. Un segundo repositorio, o un script que inserte en
   * `movimientos_insumo` directo, la rompe sin que la base lo note.
   *
   * El nombre dice que bloquea a propósito: una consulta de solo lectura —el
   * stock que se muestra en la ficha— no debe pasar por acá, porque haría
   * esperar a los escritores del insumo sin necesidad.
   *
   * @param insumoId Insumo cuya bitácora se bloquea y se suma.
   * @returns Las sumas por tipo, con `0` en los tipos sin movimientos. Todos los tipos en cero si el insumo no tiene bitácora.
   */
  lockAndSumByTipo(insumoId: string): Promise<SumasPorTipoMovimiento>;
}

/** Token de inyección de dependencias para IMovimientoInsumoRepository en NestJS. */
export const MOVIMIENTO_INSUMO_REPOSITORY = Symbol('MOVIMIENTO_INSUMO_REPOSITORY');
