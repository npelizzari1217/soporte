import { Result } from '../../../shared/domain/result';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponenteNotFoundError } from '../../domain/errors/tipos-componente.errors';

/** DTO para reactivar un tipo de componente del catálogo MASTER. */
export interface ActivarTipoComponenteDto {
  id: string;
}

/**
 * ActivarTipoComponenteUseCase — reactiva (`activo=true`) un tipo de
 * componente del catálogo MASTER, exclusivo de ROOT (autorización enforced
 * por `GlobalAdminGuard` en el controller).
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
 */
export class ActivarTipoComponenteUseCase {
  constructor(private readonly repo: Pick<ITipoComponenteMasterRepository, 'findById' | 'save'>) {}

  async execute(
    dto: ActivarTipoComponenteDto,
  ): Promise<Result<TipoComponente, TipoComponenteNotFoundError>> {
    const tipo = await this.repo.findById(dto.id);
    if (!tipo) {
      return Result.fail(new TipoComponenteNotFoundError(dto.id));
    }

    tipo.activar();
    await this.repo.save(tipo);
    return Result.ok(tipo);
  }
}
