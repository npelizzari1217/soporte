/**
 * EquipoInformaticoMapper — convierte entre Prisma EquipoInformatico (fila
 * de DB) y EquipoInformaticoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T11.2.
 */
import type { EquipoInformatico as PrismaEquipoInformatico } from '.prisma/tenant';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';

export class EquipoInformaticoMapper {
  /** Convierte una fila de DB Prisma → EquipoInformaticoEntity de dominio. */
  static toDomain(row: PrismaEquipoInformatico): EquipoInformaticoEntity {
    return EquipoInformaticoEntity.reconstitute(
      {
        nombre: row.nombre,
        numeroSerie: row.numeroSerie ?? null,
        marca: row.marca ?? null,
        modelo: row.modelo ?? null,
        fechaAdquisicion: row.fechaAdquisicion ?? null,
        ubicacionId: row.ubicacionId ?? null,
        asignadoAId: row.asignadoAId ?? null,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte EquipoInformaticoEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para que el repo lo use en el CREATE y lo excluya
   * del UPDATE (nunca pisar el timestamp de creación existente en DB).
   */
  static toPersistence(
    entity: EquipoInformaticoEntity,
  ): Omit<PrismaEquipoInformatico, 'updatedAt'> {
    return {
      id: entity.id,
      nombre: entity.nombre,
      numeroSerie: entity.numeroSerie,
      marca: entity.marca,
      modelo: entity.modelo,
      fechaAdquisicion: entity.fechaAdquisicion,
      ubicacionId: entity.ubicacionId,
      asignadoAId: entity.asignadoAId,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
