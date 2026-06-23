/**
 * EquipoInformaticoMapper — convierte entre Prisma EquipoInformatico y EquipoInformaticoEntity.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 6.C.2
 */
import type { EquipoInformatico as PrismaEquipoInformatico } from '.prisma/tenant';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';

export class EquipoInformaticoMapper {
  /**
   * Convierte una fila de DB Prisma → EquipoInformaticoEntity de dominio.
   */
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
   * EquipoInformaticoEntity → objeto plano para Prisma upsert.
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(
    entity: EquipoInformaticoEntity,
  ): Omit<PrismaEquipoInformatico, 'createdAt' | 'updatedAt'> {
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
    };
  }
}
