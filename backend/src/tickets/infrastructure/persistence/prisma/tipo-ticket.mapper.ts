/**
 * TipoTicketMapper — convierte entre Prisma TipoTicket (fila de DB) y
 * TipoTicketEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T2.2
 */
import type { TipoTicket as PrismaTipoTicket } from '.prisma/tenant';
import { TipoTicketEntity } from '../../../domain/entities/tipo-ticket.entity';
import { Modulo } from '../../../../shared/domain/modulos';

export class TipoTicketMapper {
  /**
   * Convierte una fila de DB Prisma → TipoTicketEntity de dominio.
   * `modulo` se persiste como VarChar; el CHECK de valores válidos lo garantiza
   * la capa de aplicación (crear/editar validan contra `MODULOS`).
   */
  static toDomain(row: PrismaTipoTicket): TipoTicketEntity {
    return TipoTicketEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        modulo: row.modulo as Modulo,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte TipoTicketEntity → objeto plano para Prisma upsert (T11.1,
   * PR11). Incluye `createdAt` para que el repo lo use en el CREATE y lo
   * excluya del UPDATE (nunca pisar el timestamp de creación existente).
   */
  static toPersistence(entity: TipoTicketEntity): Omit<PrismaTipoTicket, 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      modulo: entity.modulo,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
