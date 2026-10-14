/**
 * TicketEdiliciaMapper — convierte entre Prisma TicketEdilicia (fila de DB)
 * y TicketEdiliciaEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T7.2.
 */
import type { TicketEdilicia as PrismaTicketEdilicia } from '.prisma/tenant';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';

export class TicketEdiliciaMapper {
  /** Convierte una fila de DB Prisma → TicketEdiliciaEntity de dominio. */
  static toDomain(row: PrismaTicketEdilicia): TicketEdiliciaEntity {
    return TicketEdiliciaEntity.reconstitute(
      {
        ticketId: row.ticketId,
        ubicacion: row.ubicacion ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte TicketEdiliciaEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   */
  static toPersistence(entity: TicketEdiliciaEntity): Omit<PrismaTicketEdilicia, 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      ubicacion: entity.ubicacion,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
