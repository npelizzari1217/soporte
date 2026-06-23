/**
 * TipoComponenteMapper — convierte entre Prisma TipoComponente y TipoComponenteEntity.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 6.C.2
 */
import type { TipoComponente as PrismaTipoComponente } from '.prisma/tenant';
import { TipoComponenteEntity } from '../../../domain/entities/tipos-componente.entity';

export class TipoComponenteMapper {
  /**
   * Convierte una fila de DB Prisma → TipoComponenteEntity de dominio.
   */
  static toDomain(row: PrismaTipoComponente): TipoComponenteEntity {
    return TipoComponenteEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * TipoComponenteEntity → objeto plano para Prisma upsert.
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(
    entity: TipoComponenteEntity,
  ): Omit<PrismaTipoComponente, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
    };
  }
}
