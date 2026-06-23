/**
 * TicketSoporteMapper — convierte entre Prisma TicketSoporte y TicketSoporteEntity.
 *
 * Nota: el modelo TicketSoporte incluye asignado_a_id (soft ref a master.usuarios)
 * que no está en TicketSoporteProps (la entidad de dominio no lo expone).
 * El mapper lo persiste si el dominio lo soporta, pero en esta versión de la
 * entidad TicketSoporteProps no tiene asignadoAId — se ignora al mapear a dominio.
 * Decisión inferida: asignadoAId en ticket_soporte es un campo de infraestructura
 * que el dominio actual no modela explícitamente (el equipo tiene su propio asignadoAId).
 * MARCAR para consulta si se necesita en futuros use cases.
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
   * asignadoAId: almacenado en DB pero no modelado en TicketSoporteProps.
   *   El dominio de ticket_soporte no expone este campo — ver nota en el header.
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
   * asignadoAId: se persiste como null (la entidad de dominio no lo modela aún).
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
      asignadoAId: null, // no modelado en TicketSoporteProps — ver nota en el header
      deletedAt: entity.deletedAt,
    };
  }
}
