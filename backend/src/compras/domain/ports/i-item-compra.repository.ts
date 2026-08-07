import { ItemCompraEntity } from '../entities/item-compra.entity';

/**
 * IItemCompraRepository — puerto de persistencia para los ítems de compra
 * (`items_compra`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaItemCompraRepository`, PR3) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C2. Ref design: "Firmas TS
 * clave" (ports/*). Tarea: T2.7.
 */
export interface IItemCompraRepository {
  /**
   * Busca un ítem por su identificador técnico. Retorna `null` si no
   * existe. Incluye registros soft-deleted.
   */
  findById(id: string): Promise<ItemCompraEntity | null>;

  /**
   * Retorna los ítems ACTIVOS (`deleted_at IS NULL`) de un `ticket_compra`.
   */
  findActiveByTicketCompraId(ticketCompraId: string): Promise<ItemCompraEntity[]>;

  /**
   * Persiste el ítem (upsert: crea si no existe, actualiza si existe).
   */
  save(item: ItemCompraEntity): Promise<void>;

  /**
   * Baja lógica del ítem (soft delete). NO elimina la fila — setea
   * `deleted_at`.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IItemCompraRepository en NestJS. */
export const ITEM_COMPRA_REPOSITORY = Symbol('ITEM_COMPRA_REPOSITORY');
