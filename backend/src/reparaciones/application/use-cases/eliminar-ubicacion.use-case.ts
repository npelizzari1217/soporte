import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IUbicacionRepository } from '../../domain/ports/i-ubicacion.repository';
import { UbicacionNoEncontradaError } from '../../domain/errors/reparaciones.errors';

/** DTO para eliminar una ubicación (soft delete con cascada lógica, F3-E2). */
export interface EliminarUbicacionDto {
  /** UUID de la ubicación raíz del subárbol a eliminar. */
  ubicacionId: string;
}

/**
 * EliminarUbicacionUseCase — elimina lógicamente una ubicación y todos sus
 * descendientes (F3-E2, riesgo técnico #3 del design).
 *
 * Flujo:
 * 1. Carga la ubicación raíz → `UbicacionNoEncontradaError` si no existe o
 *    ya fue eliminada.
 * 2. DENTRO de la transacción (atomicidad total lectura+borrado):
 *    a. CTE recursiva `findSubtree` → raíz + todos los descendientes no
 *       soft-deleted, en una sola query.
 *    b. Soft-delete de cada ubicación del árbol (loop).
 *
 * El spec de Fase 3 (F3-E2) NO requiere registrar operaciones de timeline
 * en los tickets edilicios afectados (a diferencia de la referencia
 * probada soporte1, que sí lo hacía) — decisión de scope explícita, ver
 * design "Archivos afectados" PR8.
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Ref design: riesgo
 * técnico #3 (findSubtree CTE). Tarea: T8.4.
 */
export class EliminarUbicacionUseCase {
  constructor(
    private readonly ubicacionRepo: Pick<
      IUbicacionRepository,
      'findById' | 'findSubtree' | 'delete'
    >,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarUbicacionDto): Promise<Result<void, DomainError>> {
    const ubicacionRaiz = await this.ubicacionRepo.findById(dto.ubicacionId);
    if (!ubicacionRaiz || ubicacionRaiz.isDeleted()) {
      return Result.fail(new UbicacionNoEncontradaError(dto.ubicacionId));
    }

    await this.txRunner.run(async () => {
      const todasLasUbicaciones = await this.ubicacionRepo.findSubtree(dto.ubicacionId);
      for (const ubicacion of todasLasUbicaciones) {
        await this.ubicacionRepo.delete(ubicacion.id);
      }
    });

    return Result.ok(undefined);
  }
}
