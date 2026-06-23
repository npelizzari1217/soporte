/**
 * OperacionTicketMapper — convierte entre Prisma OperacionTicket y OperacionTicketEntity.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 * La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * metadata: Prisma devuelve `Json | null` (Prisma.JsonValue); lo casteamos a
 * `Record<string, unknown> | null` para el dominio. El camino inverso usa `as any`
 * para sortear la limitación de tipos de Prisma con campos `Json?` nullable
 * (Prisma requiere Prisma.DbNull sentinel pero en runtime `null` → SQL NULL es correcto).
 *
 * Tarea: 3.D.2
 */
import type { OperacionTicket as PrismaOperacionTicket } from '.prisma/tenant';
import { OperacionTicketEntity } from '../../../domain/entities/operacion-ticket.entity';

export class OperacionTicketMapper {
  /**
   * Convierte una fila de DB Prisma → OperacionTicketEntity de dominio.
   */
  static toDomain(row: PrismaOperacionTicket): OperacionTicketEntity {
    return OperacionTicketEntity.reconstitute(
      {
        ticketId: row.ticketId,
        tipoOperacionId: row.tipoOperacionId,
        descripcion: row.descripcion ?? null,
        estadoAnteriorId: row.estadoAnteriorId ?? null,
        estadoNuevoId: row.estadoNuevoId ?? null,
        autorId: row.autorId,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte OperacionTicketEntity → objeto plano para Prisma create.
   * Las operaciones son solo INSERT (el timeline es inmutable).
   *
   * Retorna `Record<string, unknown>` para evitar conflictos de tipos con
   * el campo `metadata: Json?` de Prisma (que requiere Prisma.DbNull sentinel
   * para null, pero en runtime `null` → SQL NULL es el comportamiento correcto).
   */

  static toPersistence(entity: OperacionTicketEntity): Record<string, any> {
    return {
      id: entity.id,
      ticketId: entity.ticketId,
      tipoOperacionId: entity.tipoOperacionId,
      descripcion: entity.descripcion,
      estadoAnteriorId: entity.estadoAnteriorId,
      estadoNuevoId: entity.estadoNuevoId,
      autorId: entity.autorId,
      metadata: entity.metadata ?? null,
      deletedAt: entity.deletedAt,
    };
  }
}
