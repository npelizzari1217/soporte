/**
 * TicketEdiliciaMapper — convierte entre Prisma TicketEdilicia (fila de DB)
 * y TicketEdiliciaEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * La ubicación sale del ticket base (odd/ticket-unificado): la columna vieja
 * `ticket_edilicia.ubicacion` ni se lee ni se escribe.
 *
 * Tarea: T7.2.
 */
import type { TicketEdilicia as PrismaTicketEdilicia } from '.prisma/tenant';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';

/** Fila del satélite con la ubicación de su ticket base (`include`). */
export type TicketEdiliciaConUbicacion = PrismaTicketEdilicia & {
  ticket: { ubicacion: string | null };
};

/** Columnas que el satélite escribe: todas salvo la `ubicacion` congelada y `updatedAt`. */
export type TicketEdiliciaPersistencia = Omit<PrismaTicketEdilicia, 'updatedAt' | 'ubicacion'>;

export class TicketEdiliciaMapper {
  /** Convierte una fila de DB Prisma → TicketEdiliciaEntity de dominio. */
  static toDomain(row: TicketEdiliciaConUbicacion): TicketEdiliciaEntity {
    return TicketEdiliciaEntity.reconstitute(
      {
        ticketId: row.ticketId,
        ubicacion: row.ticket.ubicacion ?? null,
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
  static toPersistence(entity: TicketEdiliciaEntity): TicketEdiliciaPersistencia {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
