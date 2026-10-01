/**
 * EventoUnidadInsumoMapper — conversión entre la fila de
 * `eventos_unidad_insumo` y `EventoUnidadInsumoEntity`.
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Sin `toPersistence` de UPDATE: la tabla es append-only, así que el único
 * shape de escritura es el del INSERT.
 */
import type { EventoUnidadInsumo as PrismaEventoUnidadInsumo } from '.prisma/tenant';
import { EventoUnidadInsumoEntity } from '../../../domain/entities/evento-unidad-insumo.entity';
import type { TipoEventoUnidad } from '../../../domain/entities/unidad-insumo.entity';

/** Shape del INSERT: sin `createdAt`, que pone `DEFAULT clock_timestamp()` (mismo criterio que `MovimientoInsumoMapper`). */
export type FilaEventoUnidadInsumo = Omit<PrismaEventoUnidadInsumo, 'createdAt'>;

export class EventoUnidadInsumoMapper {
  /**
   * `tipo` es `VarChar` sin enum de Prisma: el cast es seguro por el CHECK de
   * la tabla, que el spec de constraints compara contra `TIPOS_EVENTO_UNIDAD`.
   *
   * @param row Fila de `eventos_unidad_insumo` tal como la devuelve Prisma.
   * @returns El evento reconstituido, con su fecha de alta.
   */
  static toDomain(row: PrismaEventoUnidadInsumo): EventoUnidadInsumoEntity {
    return EventoUnidadInsumoEntity.reconstitute(
      {
        unidadId: row.unidadId,
        tipo: row.tipo as TipoEventoUnidad,
        movimientoId: row.movimientoId ?? null,
        equipoId: row.equipoId ?? null,
        componenteId: row.componenteId ?? null,
        serialAnterior: row.serialAnterior ?? null,
        serialNuevo: row.serialNuevo ?? null,
        motivo: row.motivo ?? null,
        usuarioId: row.usuarioId,
      },
      row.id,
      row.createdAt,
    );
  }

  /**
   * Incluye `id`: la instalación escribe el evento antes que el componente y
   * necesita el id que la entidad ya generó (ADR-9). Los nullables viajan como
   * `null` explícito.
   *
   * @param entity Evento de dominio a asentar.
   * @returns El shape de fila que espera Prisma, sin `createdAt`.
   */
  static toPersistence(entity: EventoUnidadInsumoEntity): FilaEventoUnidadInsumo {
    return {
      id: entity.id,
      unidadId: entity.unidadId,
      tipo: entity.tipo,
      movimientoId: entity.movimientoId,
      equipoId: entity.equipoId,
      componenteId: entity.componenteId,
      serialAnterior: entity.serialAnterior,
      serialNuevo: entity.serialNuevo,
      motivo: entity.motivo,
      usuarioId: entity.usuarioId,
    };
  }
}
