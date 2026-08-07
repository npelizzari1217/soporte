import { DomainError, Result } from '../../../shared/domain/result';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para eliminar (soft delete) un equipo (F3-Q1). */
export interface EliminarEquipoDto {
  equipoId: string;
}

/**
 * EliminarEquipoUseCase — baja lógica (soft delete) de un equipo del
 * inventario (F3-Q1). DISTINTO de `deactivate()` (ver ADR-9): esta
 * operación borra lógicamente el registro; `deactivate()` solo lo marca
 * fuera de servicio manteniéndolo visible en el historial.
 *
 * Flujo:
 * 1. Verifica que el equipo exista y no esté ya eliminado.
 * 2. Ejecuta soft delete vía `repo.delete()` — NUNCA DELETE físico.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.2.
 */
export class EliminarEquipoUseCase {
  constructor(
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById' | 'delete'>,
  ) {}

  async execute(dto: EliminarEquipoDto): Promise<Result<void, DomainError>> {
    const equipo = await this.equipoRepo.findById(dto.equipoId);
    if (!equipo || equipo.isDeleted()) {
      return Result.fail(new EquipoNoEncontradoError(dto.equipoId));
    }

    await this.equipoRepo.delete(dto.equipoId);
    return Result.ok(undefined);
  }
}
