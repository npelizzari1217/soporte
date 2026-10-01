import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../entities/unidad-insumo.entity';
import { ConteoPorCondicion } from '../entities/tipo-movimiento-insumo';

/**
 * IUnidadInsumoRepository — puerto de persistencia de las unidades por número
 * de serie (sdd/repuestos-numero-de-serie, ADR-1 y ADR-4).
 *
 * Es la capa de mecanismos de `OperacionesUnidadInsumo`: lecturas con lock de
 * fila y escrituras por CAS. Definido en el dominio, sin imports de Prisma ni
 * de NestJS.
 *
 * **Locks.** Las lecturas con lock son L3 de la invariante de ADR-12
 * (`FOR NO KEY UPDATE`, en orden de id) y exigen una transacción activa: fuera
 * de ella Postgres libera el lock al terminar la sentencia. Se toman DESPUÉS de
 * L1 (la fila del insumo) y L2 (`bloquearStock`).
 */
export interface IUnidadInsumoRepository {
  /**
   * Inserta una unidad nueva. Una violación del índice único del serial
   * normalizado (P2002) se traduce a `SerialDuplicadoError` y se LANZA
   * envuelta en `FalloOperacionDeUnidad`: es la única falla posterior a
   * escribir y el llamador la desenvuelve afuera de su transacción.
   *
   * @param unidad Unidad de dominio nueva.
   * @throws FalloOperacionDeUnidad si el serial ya lo tiene otra unidad del insumo.
   */
  insertar(unidad: UnidadInsumoEntity): Promise<void>;

  /**
   * Lee las unidades con `FOR NO KEY UPDATE` (L3), en orden de id, sin
   * importar el orden en que se pidan. Los ids que no existen no aparecen en el
   * resultado: detectarlo es del llamador.
   *
   * @param ids Ids de las unidades; vacío devuelve vacío sin ir a la base.
   * @returns Las unidades encontradas, ordenadas por id.
   * @throws Error si no hay una transacción activa del tenant.
   */
  bloquearPorIds(ids: readonly string[]): Promise<UnidadInsumoEntity[]>;

  /**
   * Persiste la transición o la corrección de serial de una unidad ya leída
   * bajo lock, como CAS: `UPDATE … WHERE id = ? AND estado = ?`. Escribe serial,
   * condición, estado y equipo de la entidad.
   *
   * Que el CAS afecte 0 filas bajo el lock de fila es un bug (alguien escribió
   * sin respetar el orden de locks) y LANZA un `Error`; no es un `Result`.
   * Una violación del índice único del serial (corrección o carga) se traduce
   * igual que en `insertar()`.
   *
   * @param unidad Unidad con el estado nuevo ya aplicado.
   * @param estadoEsperado Estado con el que se leyó bajo el lock.
   * @throws Error si el CAS no afectó ninguna fila.
   * @throws FalloOperacionDeUnidad si el serial nuevo ya lo tiene otra unidad del insumo.
   */
  guardarConEstadoEsperado(
    unidad: UnidadInsumoEntity,
    estadoEsperado: EstadoUnidadInsumo,
  ): Promise<void>;

  /**
   * Cuenta las unidades `EN_DEPOSITO` del insumo por condición (el saldo de un
   * insumo `SERIE`, ADR-2), con ambas condiciones presentes. Sin lock: es una
   * foto, salvo que el llamador ya tenga L1/L2 del insumo.
   *
   * @param insumoId Insumo a contar.
   */
  contarEnDepositoPorCondicion(insumoId: string): Promise<ConteoPorCondicion>;

  /**
   * Versión de lote de `contarEnDepositoPorCondicion()`: cuenta las unidades
   * `EN_DEPOSITO` de varios insumos por condición en una sola consulta agregada
   * (las pendientes de serie cuentan: son `EN_DEPOSITO`).
   *
   * **Contrato**: cada id pedido está en el mapa, con ambas condiciones
   * presentes (en `0` si no tiene unidades). Una lista vacía devuelve un mapa
   * vacío sin ir a la base. Sin lock y sin exigir transacción: es una foto.
   *
   * @param insumoIds Insumos a contar.
   * @returns Mapa insumoId -> unidades `EN_DEPOSITO` por condición.
   */
  contarEnDepositoPorCondicionDeInsumos(
    insumoIds: readonly string[],
  ): Promise<Map<string, ConteoPorCondicion>>;

  /**
   * Cuenta las unidades del insumo por estado, con los cuatro presentes. Es el
   * insumo de `InsumoEntity.puedeCambiarSeguimiento()`. Sin lock propio.
   *
   * @param insumoId Insumo a contar.
   */
  contarPorEstado(insumoId: string): Promise<Record<EstadoUnidadInsumo, number>>;

  /**
   * Lista las unidades de un insumo, ordenadas por id. Sin lock.
   *
   * @param insumoId Insumo a listar.
   * @param estados Si viene, solo las que estén en alguno de esos estados.
   */
  listarPorInsumo(
    insumoId: string,
    estados?: readonly EstadoUnidadInsumo[],
  ): Promise<UnidadInsumoEntity[]>;

  /**
   * Busca una unidad por id, sin lock. Es una foto: no autoriza ninguna
   * transición.
   *
   * @param id Id de la unidad.
   * @returns La unidad, o `null` si no existe.
   */
  findById(id: string): Promise<UnidadInsumoEntity | null>;

  /**
   * Resuelve el nombre de los equipos que las unidades y su historial refieren.
   * Es una lectura de presentación, sin lock: los ids que no existen no aparecen.
   *
   * @param ids Ids de equipos; vacío devuelve vacío sin ir a la base.
   * @returns Mapa id -> nombre del equipo.
   */
  nombresDeEquipos(ids: readonly string[]): Promise<Map<string, string>>;

  /**
   * Resuelve el nombre de los sectores que el historial muestra como destino de
   * una entrega. Lectura de presentación, sin lock.
   *
   * @param ids Ids de sectores; vacío devuelve vacío sin ir a la base.
   * @returns Mapa id -> nombre del sector.
   */
  nombresDeSectores(ids: readonly string[]): Promise<Map<string, string>>;
}

/** Token de inyección de dependencias para IUnidadInsumoRepository en NestJS. */
export const UNIDAD_INSUMO_REPOSITORY = Symbol('UNIDAD_INSUMO_REPOSITORY');
