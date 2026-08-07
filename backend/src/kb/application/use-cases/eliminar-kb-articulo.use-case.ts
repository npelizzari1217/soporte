import { DomainError, Result } from '../../../shared/domain/result';
import { IKbArticuloRepository } from '../../domain/ports/i-kb-articulo.repository';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';

/** DTO de entrada de `EliminarKbArticuloUseCase` (K1). */
export interface EliminarKbArticuloDto {
  id: string;
}

/**
 * EliminarKbArticuloUseCase — soft delete de un artículo de KB (K1). Un
 * artículo ya soft-deleted se trata como inexistente (idempotencia vía 404,
 * mismo criterio que `ObtenerTicketUseCase`).
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K3/K4.
 */
export class EliminarKbArticuloUseCase {
  constructor(private readonly repo: Pick<IKbArticuloRepository, 'findById' | 'softDelete'>) {}

  async execute(dto: EliminarKbArticuloDto): Promise<Result<void, DomainError>> {
    const articulo = await this.repo.findById(dto.id);
    if (!articulo || articulo.isDeleted()) {
      return Result.fail(new KbArticuloNoEncontradoError(dto.id));
    }

    await this.repo.softDelete(dto.id);
    return Result.ok(undefined);
  }
}
