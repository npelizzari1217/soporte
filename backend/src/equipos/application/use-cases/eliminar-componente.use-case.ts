import { DomainError, Result } from '../../../shared/domain/result';
import { ComponenteNoEncontradoError } from '../../domain/errors/equipos.errors';
import { IComponenteEquipoRepository } from '../../domain/ports/i-componente-equipo.repository';

/** DTO de entrada para eliminar (soft delete) un componente de equipo (F3-Q2). */
export interface EliminarComponenteDto {
  componenteId: string;
}

/**
 * EliminarComponenteUseCase — baja lógica de un componente de equipo
 * (F3-Q2).
 *
 * Flujo:
 * 1. Verifica que el componente exista y no esté ya eliminado.
 * 2. Ejecuta soft delete vía `repo.delete()` — NUNCA DELETE físico.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2. Tarea: T12.5.
 */
export class EliminarComponenteUseCase {
  constructor(
    private readonly componenteRepo: Pick<IComponenteEquipoRepository, 'findById' | 'delete'>,
  ) {}

  async execute(dto: EliminarComponenteDto): Promise<Result<void, DomainError>> {
    const componente = await this.componenteRepo.findById(dto.componenteId);
    if (!componente || componente.isDeleted()) {
      return Result.fail(new ComponenteNoEncontradoError(dto.componenteId));
    }

    await this.componenteRepo.delete(dto.componenteId);
    return Result.ok(undefined);
  }
}
