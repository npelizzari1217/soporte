/**
 * EquipoInformaticoMapper — convierte entre Prisma EquipoInformatico (fila
 * de DB) y EquipoInformaticoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T11.2.
 */
import type { EquipoInformatico as PrismaEquipoInformatico, Prisma } from '.prisma/tenant';
import {
  CategoriaBajaEquipo,
  DestinoBajaEquipo,
  EquipoInformaticoEntity,
} from '../../../domain/entities/equipo-informatico.entity';

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
        modeloEquipoId: row.modeloEquipoId ?? null,
        importe: row.importe !== null ? Number(row.importe) : null,
        fechaValoracion: row.fechaValoracion ?? null,
        observaciones: row.observaciones ?? null,
        valorResidual: row.valorResidual !== null ? Number(row.valorResidual) : null,
        fechaValorResidual: row.fechaValorResidual ?? null,
        activo: row.activo,
        bajaDestino: row.bajaDestino as DestinoBajaEquipo | null,
        bajaCategoria: row.bajaCategoria as CategoriaBajaEquipo | null,
        bajaMotivo: row.bajaMotivo ?? null,
        bajaFecha: row.bajaFecha ?? null,
        bajaUsuarioId: row.bajaUsuarioId ?? null,
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
   *
   * `modeloEquipoId` SÍ va en el objeto, leído de la entidad. No alcanza con
   * omitirlo del literal: el UPDATE del upsert manda este mismo objeto, así que
   * un campo que no viaja es un campo que no se puede desvincular, y un
   * `modeloEquipoId: null` fijo pisaría el modelo del equipo en cada guardado.
   * `prisma-equipos.integration.spec.ts` guarda dos veces y relee para probar
   * que el valor sobrevive.
   *
   * Las columnas `qr_*` quedan afuera a propósito: solo `guardarQrHash()` las escribe, así un
   * `save()` con una entidad vieja no regenera ni borra el QR.
   */
  static toPersistence(entity: EquipoInformaticoEntity): Omit<
    PrismaEquipoInformatico,
    'updatedAt' | 'importe' | 'valorResidual' | 'qrTokenHash' | 'qrEmitidoAt'
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
      modeloEquipoId: entity.modeloEquipoId,
      importe: entity.importe,
      fechaValoracion: entity.fechaValoracion,
      observaciones: entity.observaciones,
      valorResidual: entity.valorResidual,
      fechaValorResidual: entity.fechaValorResidual,
      activo: entity.activo,
      bajaDestino: entity.bajaDestino,
      bajaCategoria: entity.bajaCategoria,
      bajaMotivo: entity.bajaMotivo,
      bajaFecha: entity.bajaFecha,
      bajaUsuarioId: entity.bajaUsuarioId,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
