/**
 * MovimientoInsumoMapper — conversión entre la fila de `movimientos_insumo` y
 * `MovimientoInsumoEntity`.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Es un mapper de UNA entidad y no de un agregado: el movimiento no tiene
 * hijos, y la bitácora de un insumo es una colección de asientos
 * independientes, no un árbol que se lea y se escriba entero.
 *
 * Sin `toPersistence` de UPDATE: la tabla es append-only, así que el único
 * shape de escritura es el del INSERT. Precedente exacto:
 * `ComentarioReparacionMapper`.
 *
 * Ref design: openspec/changes/insumos-entrega-2/design.md, decisión 4.
 */
import type { MovimientoInsumo as PrismaMovimientoInsumo, Prisma } from '.prisma/tenant';
import { MovimientoInsumoEntity } from '../../../domain/entities/movimiento-insumo.entity';
import { TipoMovimientoInsumo } from '../../../domain/entities/tipo-movimiento-insumo';

/**
 * Shape del INSERT de un movimiento. `cantidad` se ensancha a
 * `Prisma.Decimal | number` —Prisma acepta las dos en una columna `Decimal`—
 * con el mismo criterio que `InsumoMapper.toPersistence` para `stockMinimo`.
 * Sin `updatedAt` ni `deletedAt`: la tabla no tiene esas columnas.
 */
export type FilaMovimientoInsumo = Omit<PrismaMovimientoInsumo, 'cantidad'> & {
  cantidad: Prisma.Decimal | number;
};

export class MovimientoInsumoMapper {
  /**
   * Convierte la fila de `movimientos_insumo` a `MovimientoInsumoEntity`.
   *
   * `cantidad` es `Decimal` en Prisma (columna `DECIMAL(10,2)`) y se convierte
   * a `number` — misma decisión que compras, equipos e insumos. Acá no hay
   * caso `null` que preservar: la columna es `NOT NULL`.
   *
   * `tipo` es `VarChar` en la base, no un enum de Prisma, así que el cast a
   * `TipoMovimientoInsumo` es inevitable. Es seguro por el CHECK
   * `movimientos_insumo_tipo_check`, que enumera exactamente
   * `TIPOS_MOVIMIENTO_INSUMO` — y que un spec de integración compara contra
   * `pg_get_constraintdef`, así que la deriva entre los dos catálogos sale en
   * rojo antes que en producción. Mismo criterio que `OperacionCompraMapper`.
   *
   * @param row Fila de `movimientos_insumo` tal como la devuelve Prisma.
   * @returns El asiento reconstituido, con su id y su fecha de alta.
   */
  static toDomain(row: PrismaMovimientoInsumo): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.reconstitute(
      {
        insumoId: row.insumoId,
        tipo: row.tipo as TipoMovimientoInsumo,
        cantidad: Number(row.cantidad),
        usuarioId: row.usuarioId,
        motivo: row.motivo ?? null,
        equipoId: row.equipoId ?? null,
        sectorId: row.sectorId ?? null,
      },
      row.id,
      row.createdAt,
    );
  }

  /**
   * Convierte el asiento al shape plano del INSERT.
   *
   * Incluye `id` y `createdAt`, los dos a propósito y por el mismo motivo: los
   * genera `BaseEntity` ANTES del INSERT y la entidad en memoria ya los tiene.
   * Dejárselos a la base —`DEFAULT gen_random_uuid()` y `DEFAULT
   * CURRENT_TIMESTAMP`— haría que la fila guardada y el asiento que el caso de
   * uso devuelve no coincidan, y perdería además el desempate monótono del
   * UUIDv7 entre dos asientos con el mismo `created_at`, que es justo lo que
   * la entidad gana heredando de `BaseEntity`.
   *
   * Los tres nullables viajan como `null` EXPLÍCITO y no como campo ausente:
   * para Prisma no son lo mismo, y un `undefined` que se colara del caller se
   * leería como "no tocar la columna" en vez de "sin motivo".
   *
   * @param entity Movimiento de dominio a asentar.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` ni `deletedAt`.
   */
  static toPersistence(entity: MovimientoInsumoEntity): FilaMovimientoInsumo {
    return {
      id: entity.id,
      insumoId: entity.insumoId,
      tipo: entity.tipo,
      cantidad: entity.cantidad,
      usuarioId: entity.usuarioId,
      motivo: entity.motivo,
      equipoId: entity.equipoId,
      sectorId: entity.sectorId,
      createdAt: entity.createdAt,
    };
  }
}
