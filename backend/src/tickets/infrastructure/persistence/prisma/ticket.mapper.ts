/**
 * TicketMapper — convierte entre Prisma Ticket (row de DB) y TicketEntity (dominio).
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 3.D.2
 */
import type { Ticket as PrismaTicket } from '.prisma/tenant';
import { TicketEntity } from '../../../domain/entities/ticket.entity';

export class TicketMapper {
  /**
   * Convierte una fila de DB Prisma → TicketEntity de dominio.
   * Usa TicketEntity.reconstitute() para hidratar correctamente los timestamps.
   */
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
        solicitanteId: row.solicitanteId,
        asignadoId: row.asignadoId ?? null,
        fechaCierre: row.fechaCierre ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte TicketEntity → objeto plano para Prisma upsert.
   *
   * Incluye `createdAt` para que el INSERT pueda respetar el override de
   * fechaCreacion (ADR-5). `updatedAt` es manejado por Prisma @updatedAt y se
   * excluye del objeto de persistencia.
   *
   * IMPORTANTE: el repositorio extrae `createdAt` antes del UPDATE para que
   * nunca sobrescriba el timestamp de creación existente en la DB (T3.8).
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
      solicitanteId: entity.solicitanteId,
      asignadoId: entity.asignadoId,
      fechaCierre: entity.fechaCierre,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
