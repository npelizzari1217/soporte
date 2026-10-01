/**
 * UnidadInsumoMapper — conversión entre la fila de `unidades_insumo` y
 * `UnidadInsumoEntity`.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 */
import type { UnidadInsumo as PrismaUnidadInsumo } from '.prisma/tenant';
import type { CondicionStock } from '../../../domain/entities/tipo-movimiento-insumo';
import {
  EstadoUnidadInsumo,
  UnidadInsumoEntity,
} from '../../../domain/entities/unidad-insumo.entity';

/**
 * Shape de escritura de una unidad: sin `createdAt` (lo pone el `DEFAULT
 * clock_timestamp()` de la columna, no el reloj del proceso; issues #159 y
 * #172) y sin `updatedAt` (lo maneja el ORM).
 */
export type FilaUnidadInsumo = Omit<PrismaUnidadInsumo, 'createdAt' | 'updatedAt'>;

export class UnidadInsumoMapper {
  /**
   * `condicion` y `estado` son `VarChar` sin enum de Prisma: el cast es seguro
   * por los CHECK de la tabla, que `unidades-insumo-constraints.integration.spec.ts`
   * compara contra los catálogos del dominio.
   *
   * @param row Fila de `unidades_insumo` tal como la devuelve Prisma.
   * @returns La entidad reconstituida, con sus timestamps.
   */
  static toDomain(row: PrismaUnidadInsumo): UnidadInsumoEntity {
    return UnidadInsumoEntity.reconstitute(
      {
        insumoId: row.insumoId,
        numeroSerie: row.numeroSerie ?? null,
        numeroSerieNormalizado: row.numeroSerieNormalizado ?? null,
        condicion: row.condicion as CondicionStock,
        estado: row.estado as EstadoUnidadInsumo,
        equipoId: row.equipoId ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
    );
  }

  /**
   * Incluye `id`, que la entidad genera antes del INSERT. Los nullables viajan
   * como `null` explícito: un `undefined` se leería como "no tocar la columna"
   * en vez de "sin serial" o "sin equipo" (por ejemplo al devolver una unidad
   * al depósito, que tiene que limpiar `equipoId`).
   *
   * @param entity Unidad de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `createdAt` ni `updatedAt`.
   */
  static toPersistence(entity: UnidadInsumoEntity): FilaUnidadInsumo {
    return {
      id: entity.id,
      insumoId: entity.insumoId,
      numeroSerie: entity.numeroSerie,
      numeroSerieNormalizado: entity.numeroSerieNormalizado,
      condicion: entity.condicion,
      estado: entity.estado,
      equipoId: entity.equipoId,
    };
  }
}
