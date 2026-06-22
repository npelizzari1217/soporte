/**
 * ClienteMapper — convierte entre PrismaCliente (row de DB) y ClienteEntity (dominio).
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/master' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 1.C.2
 */
import type { Cliente as PrismaCliente } from '.prisma/master';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';

export class ClienteMapper {
  /**
   * Convierte una fila de DB Prisma → ClienteEntity de dominio.
   * Usa ClienteEntity.reconstitute() para hidratar correctamente los timestamps.
   */
  static toDomain(row: PrismaCliente): ClienteEntity {
    return ClienteEntity.reconstitute(
      {
        nombre: row.nombre,
        razonSocial: row.razonSocial ?? null,
        cuit: row.cuit ?? null,
        dbName: row.dbName,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte ClienteEntity → objeto plano para Prisma upsert.
   * Excluye id, createdAt (manejados por DB o por el upsert).
   * updatedAt es manejado por @updatedAt de Prisma.
   */
  static toPersistence(entity: ClienteEntity): Omit<PrismaCliente, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      nombre: entity.nombre,
      razonSocial: entity.razonSocial,
      cuit: entity.cuit,
      dbName: entity.dbName,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
    };
  }
}
