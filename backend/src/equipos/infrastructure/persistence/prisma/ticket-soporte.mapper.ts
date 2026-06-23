/**
 * TicketSoporteMapper — convierte entre Prisma TicketSoporte y TicketSoporteEntity.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 6.C.2
 */
import type { TicketSoporte as PrismaTicketSoporte } from '.prisma/tenant';
import { TicketSoporteEntity } from '../../../domain/entities/ticket-soporte.entity';

export class TicketSoporteMapper {
  /**
   * Convierte una fila de DB Prisma → TicketSoporteEntity de dominio.
   */
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
   * TicketSoporteEntity → objeto plano para Prisma upsert.
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(
    entity: TicketSoporteEntity,
  ): Omit<PrismaTicketSoporte, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      equipoId: entity.equipoId,
      descripcionProblema: entity.descripcionProblema,
      solucionAplicada: entity.solucionAplicada,
      deletedAt: entity.deletedAt,
    };
  }
}
