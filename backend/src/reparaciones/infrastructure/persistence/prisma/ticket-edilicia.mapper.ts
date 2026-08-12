/**
 * TicketEdiliciaMapper — convierte entre Prisma TicketEdilicia (fila de DB)
 * y TicketEdiliciaEntity (dominio).
 *
 * `porcentajeAvance` es `Decimal` en Prisma (columna `NUMERIC(5,2)`) — se
 * convierte a `number` en el dominio y de vuelta al persistir (mismo
 * criterio que `PresupuestoMapper.montoTotal`).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T7.2.
 */
import type { TicketEdilicia as PrismaTicketEdilicia, Prisma } from '.prisma/tenant';
import { TicketEdiliciaEntity } from '../../../domain/entities/ticket-edilicia.entity';

export class TicketEdiliciaMapper {
  /** Convierte una fila de DB Prisma → TicketEdiliciaEntity de dominio. */
  static toDomain(row: PrismaTicketEdilicia): TicketEdiliciaEntity {
    return TicketEdiliciaEntity.reconstitute(
      {
        ticketId: row.ticketId,
        ubicacion: row.ubicacion ?? null,
        personalAsignadoId: row.personalAsignadoId ?? null,
        porcentajeAvance: Number(row.porcentajeAvance),
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
  static toPersistence(entity: TicketEdiliciaEntity): Omit<
    PrismaTicketEdilicia,
    'updatedAt' | 'porcentajeAvance'
  > & {
    porcentajeAvance: Prisma.Decimal | number | string;
  } {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      ubicacion: entity.ubicacion,
      personalAsignadoId: entity.personalAsignadoId,
      porcentajeAvance: entity.porcentajeAvance,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
