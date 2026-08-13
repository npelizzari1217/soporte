import { CompraEntity } from '../entities/compra.entity';
import { ItemCompraEntity } from '../entities/item-compra.entity';

/**
 * ICompraRepository — puerto ÚNICO de persistencia del agregado `Compra`
 * (ADR-C2, divergencia declarada vs `equipos`).
 *
 * `equipos` separa `IEquipoInformaticoRepository`/`IComponenteEquipoRepository`
 * porque `componentes_equipo` no tiene NI UN invariante cross-entidad. Acá es
 * distinto: TODOS los invariantes de esta spec son cross-item (estado
 * derivado §2/§3, S7 no eliminar ítem aprobado, S29 no cancelar con
 * `cantidadComprada>0` en algún ítem, `totalesPorMoneda` por moneda §7.1).
 * Con un repo item-scoped esos invariantes serían inexpresables en el
 * dominio y se filtrarían al caso de uso — por eso `Compra` (raíz) e
 * `ItemCompra` (dentro del agregado) comparten un solo puerto.
 *
 * `guardar()` persiste SOLO los campos de cabecera (`CompraMapper.toPersistence`
 * excluye `items`); `guardarItem()` persiste un ítem individual. Los casos de
 * uso (PR-14..PR-18) orquestan ambos dentro de la misma transacción
 * (`ITenantTransactionRunner.run(...)`) — ninguno de los dos métodos abre
 * transacción propia.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaCompraRepository`, PR-11/PR-12) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.9 (S32-S34). Ref
 * design: ADR-C2, ADR-C5 (advisory lock de `findLastSecuencia`). Tarea:
 * PR-10.
 */

/** Filtros de paginación para `findAllConItems` (S32: máximo 2 sentencias SQL por página). */
export interface CompraListFiltros {
  /** Cantidad máxima de compras a retornar. `undefined` = sin límite. */
  limit?: number;
  /** Cantidad de compras a saltear. `undefined` = 0. */
  offset?: number;
}

export interface ICompraRepository {
  /**
   * Busca una compra por su id, con TODOS sus ítems cargados (activos y
   * soft-deleted — `CompraEntity` exige la colección completa, ver
   * `compra.entity.ts:78-80`). Retorna `null` si no existe. Incluye compras
   * soft-deleted.
   */
  findByIdConItems(id: string): Promise<CompraEntity | null>;

  /**
   * Retorna las compras del tenant activo con sus ítems cargados, excluye
   * soft-deleted, ordenadas por `created_at DESC`. El `include` de ítems es
   * el que exige S32 (máximo 2 sentencias SQL por página: una para las
   * compras+items vía `include`, otra para el `count` de paginación) — la
   * implementación concreta (PR-12) es la que garantiza ese máximo, este
   * puerto solo declara la forma del resultado.
   */
  findAllConItems(filtros?: CompraListFiltros): Promise<CompraEntity[]>;

  /**
   * Retorna la última secuencia LOCAL (tenant+año) usada en `numero`
   * (formato `COM-{anio}-{00000}`). 0 si no hay compras previas de ese año.
   * Usado por `NumeradorCompra.generarNumero` (ADR-C5). La implementación
   * concreta adquiere un advisory lock de Postgres ANTES de leer — ver
   * `PrismaCompraRepository.findLastSecuencia` (PR-11), espejo de
   * `PrismaTicketRepository.findLastSecuencia`.
   */
  findLastSecuencia(anio: number): Promise<number>;

  /**
   * Persiste SOLO los campos de cabecera de la compra (upsert por id). NO
   * itera ni persiste `items` — para eso está `guardarItem()`. Nunca pisa
   * `createdAt` en el UPDATE (mismo patrón que el resto de los repos Prisma
   * del proyecto).
   */
  guardar(compra: CompraEntity): Promise<void>;

  /**
   * Persiste un ítem individual del agregado (upsert por id). Recibe el
   * `ItemCompraEntity` suelto (no la `Compra` completa) porque el ABM de
   * ítems (§4.2) y la ejecución (§4.5-§4.7) mutan un ítem a la vez — el
   * caller (`CompraEntity`) ya validó los invariantes cross-item antes de
   * llegar acá.
   */
  guardarItem(item: ItemCompraEntity): Promise<void>;
}

/** Token de inyección de dependencias para ICompraRepository en NestJS. */
export const COMPRA_REPOSITORY = Symbol('COMPRA_REPOSITORY');
