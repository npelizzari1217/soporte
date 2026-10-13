/**
 * TareaTicketMapper — convierte entre la fila `tareas_ticket` y `TareaTicketEntity`.
 * Vive en infrastructure/: puede importar de '.prisma/tenant'.
 */
import type { TareaTicket as PrismaTareaTicket } from '.prisma/tenant';
import { TareaTicketEntity } from '../../../domain/entities/tarea-ticket.entity';

export class TareaTicketMapper {
  static toDomain(row: PrismaTareaTicket): TareaTicketEntity {
    return TareaTicketEntity.reconstitute(
      {
        ticketId: row.ticketId,
        descripcion: row.descripcion,
        orden: row.orden,
        tecnicoId: row.tecnicoId,
        completada: row.completada,
        completadaEn: row.completadaEn,
        completadaPorId: row.completadaPorId,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt,
    );
  }

  /** Fila para el INSERT. `updatedAt` lo pone Prisma (`@updatedAt`). */
  static toPersistence(entity: TareaTicketEntity): Omit<PrismaTareaTicket, 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      descripcion: entity.descripcion,
      orden: entity.orden,
      tecnicoId: entity.tecnicoId,
      completada: entity.completada,
      completadaEn: entity.completadaEn,
      completadaPorId: entity.completadaPorId,
      createdAt: entity.createdAt,
      deletedAt: entity.deletedAt,
    };
  }
}
