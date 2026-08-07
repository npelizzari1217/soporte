/**
 * TicketSoporteMapper — convierte entre Prisma TicketSoporte (fila de DB) y
 * TicketSoporteEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T11.2.
 */
import type { TicketSoporte as PrismaTicketSoporte } from '.prisma/tenant';
import { TicketSoporteEntity } from '../../../domain/entities/ticket-soporte.entity';

export class TicketSoporteMapper {
  /** Convierte una fila de DB Prisma → TicketSoporteEntity de dominio. */
  static toDomain(row: PrismaTicketSoporte): TicketSoporteEntity {
    return TicketSoporteEntity.reconstitute(
      {
        ticketId: row.ticketId,
        equipoId: row.equipoId ?? null,
        descripcionProblema: row.descripcionProblema ?? null,
        solucionAplicada: row.solucionAplicada ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte TicketSoporteEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para que el repo lo use en el CREATE y lo excluya
   * del UPDATE (nunca pisar el timestamp de creación existente en DB).
   */
  static toPersistence(entity: TicketSoporteEntity): Omit<PrismaTicketSoporte, 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      equipoId: entity.equipoId,
      descripcionProblema: entity.descripcionProblema,
      solucionAplicada: entity.solucionAplicada,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
