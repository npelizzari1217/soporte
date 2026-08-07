import { TicketCompraEntity } from '../entities/ticket-compra.entity';

/**
 * TicketCompraFiltros — filtros opcionales combinables (AND) para
 * `ITicketCompraRepository.findAll`.
 */
export interface TicketCompraFiltros {
  /** UUID de `ciclos_cliente` del TICKET base (resuelto por el caller vía join en memoria). */
  cicloId?: string;
}

/**
 * ITicketCompraRepository — puerto de persistencia para el satélite
 * `ticket_compra` (1:0..1 con `Ticket`).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaTicketCompraRepository`, PR3) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1..C5. Ref design: "Firmas
 * TS clave" (ports/*). Tarea: T2.7.
 */
export interface ITicketCompraRepository {
  /**
   * Busca el `ticket_compra` por su identificador técnico (UUIDv7).
   * Retorna `null` si no existe. Incluye registros soft-deleted.
   */
  findById(id: string): Promise<TicketCompraEntity | null>;

  /**
   * Busca el `ticket_compra` asociado a un ticket base.
   * Retorna `null` si no existe (el ticket no es de tipo COMPRAS, o el
   * satélite aún no fue creado).
   */
  findByTicketId(ticketId: string): Promise<TicketCompraEntity | null>;

  /**
   * Retorna todos los `ticket_compra` del tenant activo, ordenados por
   * `created_at DESC`. Excluye soft-deleted.
   */
  findAll(filtros?: TicketCompraFiltros): Promise<TicketCompraEntity[]>;

  /**
   * Persiste el `ticket_compra` (upsert: crea si no existe, actualiza si
   * existe). El repositorio decide INSERT vs UPDATE según el id.
   */
  save(ticketCompra: TicketCompraEntity): Promise<void>;
}

/** Token de inyección de dependencias para ITicketCompraRepository en NestJS. */
export const TICKET_COMPRA_REPOSITORY = Symbol('TICKET_COMPRA_REPOSITORY');
