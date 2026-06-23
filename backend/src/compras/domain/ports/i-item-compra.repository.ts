import { ItemCompraEntity } from '../entities/item-compra.entity';

/**
 * IItemCompraRepository — puerto de persistencia para los ítems de compra.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:compras/Tabla items_compra, Gestión de ítems]
 * Tarea: 4.A.3
 */
export interface IItemCompraRepository {
  /**
   * Busca un ítem por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<ItemCompraEntity | null>;

  /**
   * Retorna todos los ítems (incluyendo soft-deleted) de un ticket_compra.
   * Usar `findActiveByTicketCompraId` para filtrar soft-deleted.
   */
  findByTicketCompraId(ticketCompraId: string): Promise<ItemCompraEntity[]>;

  /**
   * Retorna los ítems activos (deleted_at IS NULL) de un ticket_compra.
   * Usado por `EnviarAAprobacionUseCase` para verificar que exista al menos uno.
   */
  findActiveByTicketCompraId(ticketCompraId: string): Promise<ItemCompraEntity[]>;

  /**
   * Persiste el ítem (upsert: crea si no existe, actualiza si existe).
   */
  save(item: ItemCompraEntity): Promise<void>;

  /**
   * Baja lógica del ítem (soft delete). NO elimina la fila — setea deleted_at.
   * Los ítems soft-deleted son excluidos del conteo para envío a aprobación.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IItemCompraRepository en NestJS. */
export const ITEM_COMPRA_REPOSITORY = Symbol('ITEM_COMPRA_REPOSITORY');
