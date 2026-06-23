/**
 * TicketEdiliciaMapper — convierte entre Prisma TicketEdilicia y TicketEdiliciaEntity.
 *
 * Nota sobre porcentajeAvance (NUMERIC(5,2)):
 *   - Prisma lo representa como `Decimal` (runtime.Decimal) con método `.toNumber()`.
 *   - El dominio usa `number`. toDomain convierte vía `.toNumber()`.
 *   - toPersistence no anota el tipo de retorno explícito para evitar conflicto
 *     con el tipo generado (que usa Prisma.Decimal, no number).
 *     Prisma acepta number | string | Decimal en operaciones de escritura.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 5.C.2
 */
import type { TicketEdilicia as PrismaTicketEdilicia } from '.prisma/tenant';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';

export class TicketEdiliciaMapper {
  /**
   * Convierte una fila de DB Prisma → TicketEdiliciaEntity de dominio.
   * porcentajeAvance: Decimal.toNumber() para convertir al number del dominio.
   */
  static toDomain(row: PrismaTicketEdilicia): TicketEdiliciaEntity {
    return TicketEdiliciaEntity.reconstitute(
      {
        ticketId: row.ticketId,
        ubicacionId: row.ubicacionId,
        personalAsignadoId: row.personalAsignadoId ?? null,
        // Decimal.toNumber() convierte el Decimal de Prisma al number del dominio
        porcentajeAvance: row.porcentajeAvance.toNumber(),
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * TicketEdiliciaEntity → objeto plano para Prisma upsert.
   * Prisma acepta `number` para campos Decimal en operaciones de escritura.
   * No se anota el tipo de retorno explícito para no conflictuar con el tipo
   * model (que usa Prisma.Decimal para porcentajeAvance, no number).
   */
  static toPersistence(entity: TicketEdiliciaEntity) {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      ubicacionId: entity.ubicacionId,
      personalAsignadoId: entity.personalAsignadoId,
      porcentajeAvance: entity.porcentajeAvance,
      deletedAt: entity.deletedAt,
    };
  }
}
