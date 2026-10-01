import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';
import {
  EquipoConComponentesActivosError,
  EquipoDadoDeBajaError,
  EquipoNoEncontradoError,
} from '../../domain/errors/equipos.errors';

/** DTO de entrada para eliminar (soft delete) un equipo (F3-Q1). */
export interface EliminarEquipoDto {
  equipoId: string;
}

/**
 * EliminarEquipoUseCase — borrado lógico (soft delete) de un equipo CARGADO POR ERROR
 * (F3-Q1). DISTINTO de `darDeBaja()` (ADR-9): el borrado esconde el registro; la baja lo deja
 * visible en el historial y devuelve sus piezas al stock.
 *
 * Corrección de defecto (baja-equipo-completo, R13, ADR-5): antes borraba el equipo aunque
 * tuviera componentes activos, y dejaba piezas y unidades `INSTALADA` huérfanas. Ahora, dentro
 * de una transacción:
 * 1. Toma el lock LE del equipo (`FOR NO KEY UPDATE`, primero de la transacción) — espera a
 *    cualquier alta de componente en vuelo (que toma `FOR SHARE`) y viceversa.
 * 2. Inexistente o con `deletedAt` → `EquipoNoEncontradoError`.
 * 3. Dado de baja (`!activo`) → `EquipoDadoDeBajaError`.
 * 4. Con componentes activos → `EquipoConComponentesActivosError(cantidad)`.
 * 5. Si no, `delete()` — NUNCA DELETE físico. Ningún `Result.fail` ocurre tras una escritura.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1, baja-equipo-completo R13. Tarea: T12.2, WU-3.
 */
export class EliminarEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<
      IEquipoInformaticoRepository,
      'bloquearParaModificar' | 'delete'
    >,
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findActiveByEquipoId'>,
    private readonly txRunner: ITenantTransactionRunner,
  ) {}

  async execute(dto: EliminarEquipoDto): Promise<Result<void, DomainError>> {
    return this.txRunner.run(async () => {
      const equipo = await this.equipoRepo.bloquearParaModificar(dto.equipoId);
      if (!equipo || equipo.isDeleted()) {
        return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
      }
      if (!equipo.activo) {
        return Result.fail(new EquipoDadoDeBajaError(dto.equipoId));
      }

      const activos = await this.componenteRepo.findActiveByEquipoId(dto.equipoId);
      if (activos.length > 0) {
        return Result.fail(new EquipoConComponentesActivosError(activos.length));
      }

      await this.equipoRepo.delete(dto.equipoId);
      return Result.ok(undefined);
    });
  }
}
