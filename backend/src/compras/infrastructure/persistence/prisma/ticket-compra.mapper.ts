/**
 * TicketCompraMapper — convierte entre Prisma TicketCompra (fila de DB) y
 * TicketCompraEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T3.2.
 */
import type { TicketCompra as PrismaTicketCompra } from '.prisma/tenant';
import { TicketCompraEntity } from '../../../domain/entities/ticket-compra.entity';

export class TicketCompraMapper {
  /** Convierte una fila de DB Prisma → TicketCompraEntity de dominio. */
  static toDomain(row: PrismaTicketCompra): TicketCompraEntity {
    return TicketCompraEntity.reconstitute(
      {
        ticketId: row.ticketId,
        aprobadoPorId: row.aprobadoPorId ?? null,
        aprobadoEn: row.aprobadoEn ?? null,
        motivoRechazo: row.motivoRechazo ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte TicketCompraEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para que el repo lo use en el CREATE y lo excluya
   * del UPDATE (nunca pisar el timestamp de creación existente en DB).
   */
  static toPersistence(entity: TicketCompraEntity): Omit<PrismaTicketCompra, 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      aprobadoPorId: entity.aprobadoPorId,
      aprobadoEn: entity.aprobadoEn,
      motivoRechazo: entity.motivoRechazo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
