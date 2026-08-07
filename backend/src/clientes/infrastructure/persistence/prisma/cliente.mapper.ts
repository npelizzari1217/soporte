/**
 * ClienteMapper — convierte entre Prisma Cliente y ClienteEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext), consumido
 * por PrismaClienteRepository (findById requerido por `resolverScope`, R5/R10).
 */
import type { Cliente as PrismaCliente } from '.prisma/master';
import { ClienteEntity } from '../../../domain/entities/cliente.entity';

export class ClienteMapper {
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
