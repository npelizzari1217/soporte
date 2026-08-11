/**
 * EquipoInformaticoMapper — convierte entre Prisma EquipoInformatico (fila
 * de DB) y EquipoInformaticoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T11.2.
 */
import type { EquipoInformatico as PrismaEquipoInformatico, Prisma } from '.prisma/tenant';
import { EquipoInformaticoEntity } from '../../../domain/entities/equipo-informatico.entity';

export class EquipoInformaticoMapper {
  /**
   * Convierte una fila de DB Prisma → EquipoInformaticoEntity de dominio.
   * `importe`/`valorResidual` son `Decimal` en Prisma (columnas NUMERIC(14,2))
   * — se convierten a `number` en el dominio (misma decisión que compras).
   */
  static toDomain(row: PrismaEquipoInformatico): EquipoInformaticoEntity {
    return EquipoInformaticoEntity.reconstitute(
      {
        nombre: row.nombre,
        numeroSerie: row.numeroSerie ?? null,
        marca: row.marca ?? null,
        modelo: row.modelo ?? null,
        fechaAdquisicion: row.fechaAdquisicion ?? null,
        ubicacion: row.ubicacion ?? null,
        importe: row.importe !== null ? Number(row.importe) : null,
        fechaValoracion: row.fechaValoracion ?? null,
        observaciones: row.observaciones ?? null,
        valorResidual: row.valorResidual !== null ? Number(row.valorResidual) : null,
        fechaValorResidual: row.fechaValorResidual ?? null,
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
   * Los montos van como `number` (Prisma acepta number/string en columnas Decimal).
   */
  static toPersistence(entity: EquipoInformaticoEntity): Omit<
    PrismaEquipoInformatico,
    'updatedAt' | 'importe' | 'valorResidual'
  > & {
    importe: Prisma.Decimal | number | string | null;
    valorResidual: Prisma.Decimal | number | string | null;
  } {
    return {
      id: entity.id,
      nombre: entity.nombre,
      numeroSerie: entity.numeroSerie,
      marca: entity.marca,
      modelo: entity.modelo,
      fechaAdquisicion: entity.fechaAdquisicion,
      ubicacion: entity.ubicacion,
      importe: entity.importe,
      fechaValoracion: entity.fechaValoracion,
      observaciones: entity.observaciones,
      valorResidual: entity.valorResidual,
      fechaValorResidual: entity.fechaValorResidual,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
