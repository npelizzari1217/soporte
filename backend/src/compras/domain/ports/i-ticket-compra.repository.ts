import { TicketCompraEntity } from '../entities/ticket-compra.entity';

/**
 * ITicketCompraRepository — puerto de persistencia para el satélite ticket_compra.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:compras/Tabla ticket_compra, Satélite obligatorio]
 * Tarea: 4.A.3
 */
export interface ITicketCompraRepository {
  /**
   * Busca el ticket_compra asociado a un ticket base.
   * Retorna null si no existe (ticket no es de tipo COMPRAS o no fue creado).
   */
  findByTicketId(ticketId: string): Promise<TicketCompraEntity | null>;

  /**
   * Busca el ticket_compra por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<TicketCompraEntity | null>;

  /**
   * Retorna todos los ticket_compra del tenant activo, ordenados por createdAt desc.
   * Excluye registros soft-deleted.
   */
  findAll(): Promise<TicketCompraEntity[]>;

  /**
   * Persiste el ticket_compra (upsert: crea si no existe, actualiza si existe).
   */
  save(ticketCompra: TicketCompraEntity): Promise<void>;

  /**
   * Baja lógica del satélite (soft delete coherente con el ticket base).
   * NO elimina la fila — setea deleted_at.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ITicketCompraRepository en NestJS. */
export const TICKET_COMPRA_REPOSITORY = Symbol('TICKET_COMPRA_REPOSITORY');
