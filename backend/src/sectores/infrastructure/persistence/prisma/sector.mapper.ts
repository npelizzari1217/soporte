/**
 * SectorMapper — convierte entre Prisma Sector (fila de DB) y SectorEntity
 * (dominio). Archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 */
import type { Sector as PrismaSector } from '.prisma/tenant';
import { SectorEntity } from '../../../domain/entities/sector.entity';

export class SectorMapper {
  static toDomain(row: PrismaSector): SectorEntity {
    return SectorEntity.reconstitute(
      { codigo: row.codigo, nombre: row.nombre, activo: row.activo },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /** Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE. */
  static toPersistence(entity: SectorEntity): Omit<PrismaSector, 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
