import { Result } from '../../../shared/domain/result';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponenteNotFoundError } from '../../domain/errors/tipos-componente.errors';

/** DTO para renombrar un tipo de componente del catálogo MASTER. `codigo` es inmutable — no se acepta acá. */
export interface RenombrarTipoComponenteDto {
  id: string;
  nombre: string;
}

/**
 * RenombrarTipoComponenteUseCase — renombra un tipo de componente del
 * catálogo MASTER, exclusivo de ROOT (autorización enforced por
 * `GlobalAdminGuard` en el controller).
 *
 * `codigo` es inmutable (ver JSDoc de `TipoComponente`) — este use case
 * SOLO toca `nombre`.
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
 */
export class RenombrarTipoComponenteUseCase {
  constructor(private readonly repo: Pick<ITipoComponenteMasterRepository, 'findById' | 'save'>) {}

  async execute(
    dto: RenombrarTipoComponenteDto,
  ): Promise<Result<TipoComponente, TipoComponenteNotFoundError>> {
    const tipo = await this.repo.findById(dto.id);
    if (!tipo) {
      return Result.fail(new TipoComponenteNotFoundError(dto.id));
    }

    tipo.rename(dto.nombre);
    await this.repo.save(tipo);
    return Result.ok(tipo);
  }
}
