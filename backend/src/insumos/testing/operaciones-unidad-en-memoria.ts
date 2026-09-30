import { vi } from 'vitest';
import { OperacionesUnidadInsumo } from '../application/services/operaciones-unidad-insumo.service';
import type { UnidadInsumoEntity } from '../domain/entities/unidad-insumo.entity';
import type { SeguimientoInsumo } from '../domain/entities/unidad-insumo.entity';

/**
 * `OperacionesUnidadInsumo` REAL sobre repositorios en memoria, para los specs
 * unitarios de los casos de uso que solo necesitan ver las reglas de las
 * transiciones (la pendiente no sale, la `INSTALADA` tampoco) sin una base.
 * Los movimientos y eventos escritos quedan en las listas devueltas.
 */
export function operacionesEnMemoria(
  unidades: readonly UnidadInsumoEntity[],
  seguimiento: SeguimientoInsumo = 'SERIE',
) {
  const porId = new Map(unidades.map((unidad) => [unidad.id, unidad]));
  const movimientos: unknown[] = [];
  const eventos: unknown[] = [];
  const unidadRepo = {
    insertar: vi.fn(async () => undefined),
    findById: vi.fn(async (id: string) => porId.get(id) ?? null),
    bloquearPorIds: vi.fn(async (ids: string[]) =>
      ids.flatMap((id) => {
        const unidad = porId.get(id);
        return unidad === undefined ? [] : [unidad];
      }),
    ),
    guardarConEstadoEsperado: vi.fn(async () => undefined),
  };
  const operaciones = new OperacionesUnidadInsumo(
    { leerSeguimientoParaMovimiento: vi.fn(async () => seguimiento) },
    {
      bloquearStock: vi.fn(async () => undefined),
      insert: vi.fn(async (movimiento) => {
        movimientos.push(movimiento);
        return movimiento;
      }),
    },
    unidadRepo,
    {
      insert: vi.fn(async (evento) => {
        eventos.push(evento);
        return evento;
      }),
      listarPorUnidad: vi.fn(async () => []),
    },
  );
  return { operaciones, unidadRepo, movimientos, eventos };
}
