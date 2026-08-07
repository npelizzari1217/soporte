/**
 * OperacionTicketMapper — convierte entre Prisma OperacionTicket (fila de
 * DB) y OperacionTicketEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T5.4
 */
import { Prisma, type OperacionTicket as PrismaOperacionTicket } from '.prisma/tenant';
import { OperacionTicketEntity } from '../../../domain/entities/operacion-ticket.entity';

export class OperacionTicketMapper {
  /** Convierte una fila de DB Prisma → OperacionTicketEntity de dominio. */
  static toDomain(row: PrismaOperacionTicket): OperacionTicketEntity {
    return OperacionTicketEntity.reconstitute(
      {
        ticketId: row.ticketId,
        tipoOperacionId: row.tipoOperacionId,
        descripcion: row.descripcion ?? null,
        estadoAnteriorId: row.estadoAnteriorId ?? null,
        estadoNuevoId: row.estadoNuevoId ?? null,
        autorId: row.autorId,
        esInterno: row.esInterno,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte OperacionTicketEntity → input de creación Prisma. `metadata`
   * null se traduce al sentinel `Prisma.JsonNull` — Prisma distingue una
   * columna Json seteada a NULL (`Prisma.JsonNull`) de "no tocar la
   * columna" (`undefined`); pasar un `null` de JS plano en un campo Json?
   * es ambiguo para sus tipos generados.
   */
  static toPersistence(entity: OperacionTicketEntity): Prisma.OperacionTicketUncheckedCreateInput {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      tipoOperacionId: entity.tipoOperacionId,
      descripcion: entity.descripcion,
      estadoAnteriorId: entity.estadoAnteriorId,
      estadoNuevoId: entity.estadoNuevoId,
      autorId: entity.autorId,
      esInterno: entity.esInterno,
      metadata:
        entity.metadata === null ? Prisma.JsonNull : (entity.metadata as Prisma.InputJsonValue),
      createdAt: entity.createdAt,
    };
  }
}
