import { MovimientoInsumoEntity } from '../entities/movimiento-insumo.entity';
import { SumasPorCondicionYTipo } from '../entities/tipo-movimiento-insumo';

/**
 * PaginacionMovimientosInsumo — cuánto de la bitácora se pide y desde dónde.
 *
 * Mismo molde que `CompraListFiltros`: los dos campos son opcionales y su
 * ausencia significa algo distinto en cada uno, así que se dice cuál es cuál
 * en vez de dejarlo librado a la implementación.
 */
export interface PaginacionMovimientosInsumo {
  /** Cantidad máxima de movimientos a retornar. `undefined` = sin límite. */
  limit?: number;
  /** Cantidad de movimientos a saltear. `undefined` = 0. */
  offset?: number;
}

/**
 * PaginaDeMovimientosInsumo — las filas pedidas MÁS el total del universo
 * completo del insumo, ignorando `limit`/`offset`.
 *
 * Los dos valores van juntos porque la pantalla los necesita juntos: con las
 * filas sola no se sabe cuántas páginas hay, y `movimientos.length` responde
 * el tamaño de la página, nunca el del universo.
 */
export interface PaginaDeMovimientosInsumo {
  /** Movimientos de la página, YA ordenados (createdAt DESC, id DESC). */
  movimientos: MovimientoInsumoEntity[];
  /** Total de movimientos del insumo, sin `limit`/`offset`. */
  total: number;
}

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
   *
   * **Devuelve el asiento TAL COMO QUEDÓ EN LA BASE, y no el que recibió —
   * issue #159.** `movimiento.createdAt` es el reloj del PROCESO
   * (`BaseEntity` lo fija en su constructor, antes de este `insert()`); la
   * columna `created_at` la pone el `DEFAULT clock_timestamp()` de la base
   * —ver `MovimientoInsumoMapper.toPersistence()`—, que puede diferir del
   * reloj del proceso si este último derivó. El caller tiene que usar SIEMPRE
   * el valor de retorno como el asiento canónico —es el que hay que devolver
   * al usuario—, nunca el argumento que pasó.
   *
   * @param movimiento Movimiento de dominio a asentar.
   * @returns El mismo asiento, reconstituido con el `createdAt` que le asignó la base.
   */
  insert(movimiento: MovimientoInsumoEntity): Promise<MovimientoInsumoEntity>;

  /**
   * Toma el advisory lock transaccional `insumo-stock:<id>` (L2 de la
   * invariante de orden de locks, ADR-12 de sdd/repuestos-numero-de-serie) SIN
   * leer nada. Lo usan los caminos que necesitan serializar por insumo pero
   * deciden sobre otra cosa (las unidades, el seguimiento); `lockAndSumByTipo()`
   * lo llama y le suma la lectura del libro.
   *
   * Exige una transacción activa y lanza si no la hay: fuera de ella el lock
   * se libera al terminar la sentencia y no serializa a nadie. Se toma DESPUÉS
   * de L1 (la fila del insumo) y ANTES de L3 (las filas de unidades).
   *
   * @param insumoId Insumo cuyo stock se bloquea.
   * @throws Error si no hay una transacción activa del tenant.
   */
  bloquearStock(insumoId: string): Promise<void>;

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
   * esperar a los escritores del insumo sin necesidad. Para eso está
   * `sumByTipo()`, que devuelve el MISMO desglose sin tomar el lock; la
   * contracara es que su resultado no autoriza nada. Este método es el único
   * que sirve para DECIDIR sobre el stock.
   *
   * @param insumoId Insumo cuya bitácora se bloquea y se suma.
   * @returns Las sumas por condición y por tipo, con `0` donde no hay movimientos. Los 2x4 en cero si el insumo no tiene bitácora. El saldo se deriva con `calcularSaldos()`.
   */
  lockAndSumByTipo(insumoId: string): Promise<SumasPorCondicionYTipo>;

  /**
   * Devuelve el desglose de la bitácora de un insumo por condición y tipo, SIN tomar
   * ningún lock y SIN exigir transacción. Es la lectura de consulta: el stock
   * que se muestra en la ficha del insumo.
   *
   * **Su resultado es una FOTO, y puede quedar viejo apenas se devuelve.**
   * Nada impide que otra transacción asiente un movimiento del mismo insumo un
   * instante después —justamente porque acá no se serializa a nadie—, así que
   * el número que sale de este método describe un pasado reciente, no un
   * presente garantizado. **Por eso NO sirve para decidir si una salida se
   * autoriza**: dos salidas que consultaran por acá verían las mismas sumas y
   * pasarían las dos, que es exactamente la carrera que la bitácora existe
   * para evitar. Autorizar se autoriza con `lockAndSumByTipo()` dentro de la
   * misma transacción que escribe, y no hay excepción — no hay backstop de
   * base que atrape el error si se usa el método equivocado.
   *
   * Existe separado y no como una opción de `lockAndSumByTipo()` por dos
   * motivos, y los dos importan: tomar el advisory lock para mostrar un número
   * en pantalla haría esperar a los escritores del insumo cada vez que alguien
   * abre una ficha, y `lockAndSumByTipo()` además LANZA si no hay transacción
   * activa, así que una consulta no podría reusarlo ni envolviéndolo en un
   * `run()` armado solo para satisfacerlo.
   *
   * Participa de la transacción en curso si la hay: no exigirla no es
   * prohibirla.
   *
   * @param insumoId Insumo cuya bitácora se suma.
   * @returns Las sumas por condición y por tipo, con `0` donde no hay movimientos. Los 2x4 en cero si el insumo no tiene bitácora. El saldo se deriva con `calcularSaldos()`.
   */
  sumByTipo(insumoId: string): Promise<SumasPorCondicionYTipo>;

  /**
   * Devuelve las FILAS de la bitácora de un insumo, paginadas y ordenadas, con
   * el total del universo completo.
   *
   * Es la única lectura del puerto que trae asientos: las otras dos devuelven
   * agregados —`SUM(cantidad) GROUP BY tipo`— y contestan "cuánto hay", nunca
   * "qué pasó". La pregunta que responde este método es la de la ficha del
   * insumo: qué movimientos hubo, cuándo, de qué tipo y —cuando la entrada
   * vino de una recepción— de qué ítem de compra.
   *
   * **Agregar una LECTURA no contradice el append-only del puerto.** Lo que
   * hace append-only a esta bitácora es la ausencia de `update`, `delete`,
   * `save` y `guardar` en la firma: es una restricción sobre la ESCRITURA.
   * Leer las filas ya escritas no reescribe ningún hecho asentado, igual que
   * el `ALTER TABLE ADD COLUMN` nullable que la tabla ya recibió.
   *
   * **NO toma el advisory lock y NO exige transacción**, exactamente como
   * `sumByTipo()`. Es una lectura de pantalla: tomar el lock para dibujar una
   * tabla haría esperar a quien está sacando cosas del depósito, y ese es el
   * intercambio equivocado —la tabla puede mostrarse un instante vieja, el
   * depósito no puede quedar trabado—. La contracara, dicha y no escondida:
   * **el resultado es una FOTO**. Otra transacción puede asentar un movimiento
   * del mismo insumo un instante después, y esta lista no lo va a incluir. Por
   * eso NO sirve para decidir nada sobre el stock: para eso está
   * `lockAndSumByTipo()` dentro de la transacción que escribe.
   *
   * Participa de la transacción en curso si la hay: no exigirla no es
   * prohibirla.
   *
   * **El orden es `createdAt DESC, id DESC`, y el desempate por `id` no es
   * prolijidad: es lo que hace que la paginación no mienta.** Con `limit` y
   * `offset`, Postgres resuelve cada página con una consulta independiente, y
   * si la clave de orden NO ES ÚNICA el motor queda libre de desempatar de
   * distinta forma en cada una. Dos movimientos con el mismo `createdAt`
   * —dos asientos de la misma recepción, escritos en la misma transacción—
   * pueden entonces aparecer los dos en la página 1 y ninguno en la página 2,
   * o repetirse en las dos. El `id` es un UUIDv7 generado por `BaseEntity`,
   * único y monótono, así que agregarlo como segunda clave vuelve el orden
   * total y la partición en páginas determinista.
   *
   * El índice `@@index([insumoId, createdAt])` del schema ya sirve a esta
   * consulta: existe declaradamente para "la bitácora de la ficha, ordenada
   * por fecha", así que no hace falta índice nuevo.
   *
   * @param insumoId Insumo cuya bitácora se lista.
   * @param paginacion Ventana a devolver. `undefined` trae la bitácora completa.
   * @returns Los movimientos de la página ya ordenados, y el total del insumo sin paginar. Lista vacía y `total` en 0 si el insumo no tiene bitácora.
   */
  listarPorInsumo(
    insumoId: string,
    paginacion?: PaginacionMovimientosInsumo,
  ): Promise<PaginaDeMovimientosInsumo>;

  /**
   * Lee movimientos por id, sin lock y sin exigir transacción. Es la lectura del
   * historial de una unidad: el evento refiere su movimiento y el destino
   * (`sectorId`, `equipoId`) y el motivo se leen de ahí, sin copiarlos.
   *
   * @param ids Ids de movimientos; vacío devuelve vacío sin ir a la base.
   * @returns Los movimientos encontrados, en cualquier orden.
   */
  listarPorIds(ids: readonly string[]): Promise<MovimientoInsumoEntity[]>;
}

/** Token de inyección de dependencias para IMovimientoInsumoRepository en NestJS. */
export const MOVIMIENTO_INSUMO_REPOSITORY = Symbol('MOVIMIENTO_INSUMO_REPOSITORY');
