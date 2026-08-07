/**
 * TicketMapper — convierte entre Prisma Ticket (fila de DB) y TicketEntity
 * (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T5.1
 */
import type { Ticket as PrismaTicket } from '.prisma/tenant';
import { TicketEntity } from '../../../domain/entities/ticket.entity';

export class TicketMapper {
  /** Convierte una fila de DB Prisma → TicketEntity de dominio. */
  static toDomain(row: PrismaTicket): TicketEntity {
    return TicketEntity.reconstitute(
      {
        numero: row.numero,
        titulo: row.titulo,
        descripcion: row.descripcion ?? null,
        tipoId: row.tipoId,
        estadoId: row.estadoId,
        prioridadId: row.prioridadId,
        cicloId: row.cicloId ?? null,
        ticketReferenciaId: row.ticketReferenciaId ?? null,
        solicitanteId: row.solicitanteId,
        asignadoId: row.asignadoId ?? null,
        slaVenceAt: row.slaVenceAt ?? null,
        vencido: row.vencido,
        fechaCierre: row.fechaCierre ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte TicketEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para que el repo lo use en el CREATE y lo excluya del
   * UPDATE (nunca pisar el timestamp de creación existente en DB).
   */
  static toPersistence(entity: TicketEntity): Omit<PrismaTicket, 'updatedAt'> {
    return {
      id: entity.id,
      numero: entity.numero,
      titulo: entity.titulo,
      descripcion: entity.descripcion,
      tipoId: entity.tipoId,
      estadoId: entity.estadoId,
      prioridadId: entity.prioridadId,
      cicloId: entity.cicloId,
      ticketReferenciaId: entity.ticketReferenciaId,
      solicitanteId: entity.solicitanteId,
      asignadoId: entity.asignadoId,
      slaVenceAt: entity.slaVenceAt,
      vencido: entity.vencido,
      fechaCierre: entity.fechaCierre,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
