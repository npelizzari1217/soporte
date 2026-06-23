/**
 * TicketCompraMapper — convierte entre Prisma TicketCompra (row de DB) y TicketCompraEntity (dominio).
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 4.C.2
 */
import type { TicketCompra as PrismaTicketCompra } from '.prisma/tenant';
import { TicketCompraEntity } from '../../../domain/entities/ticket-compra.entity';

export class TicketCompraMapper {
  /**
   * Convierte una fila de DB Prisma → TicketCompraEntity de dominio.
   * Usa TicketCompraEntity.reconstitute() para hidratar correctamente los timestamps.
   */
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
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(
    entity: TicketCompraEntity,
  ): Omit<PrismaTicketCompra, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      aprobadoPorId: entity.aprobadoPorId,
      aprobadoEn: entity.aprobadoEn,
      motivoRechazo: entity.motivoRechazo,
      deletedAt: entity.deletedAt,
    };
  }
}
