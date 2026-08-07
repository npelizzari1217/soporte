import { DomainError, Result } from '../../../shared/domain/result';
import { TipoComponenteEntity } from '../../domain/entities/tipo-componente.entity';
import { ITipoComponenteRepository } from '../../domain/ports/i-tipo-componente.repository';

/**
 * ListarTiposComponenteUseCase — lista el catálogo READ-ONLY de tipos de
 * componente activos (F3-Q3), para poblar selectores de UI al agregar
 * componentes.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q3. Tarea: T12.5.
 */
export class ListarTiposComponenteUseCase {
  constructor(
    private readonly tipoComponenteRepo: Pick<ITipoComponenteRepository, 'findAllActive'>,
  ) {}

  async execute(): Promise<Result<TipoComponenteEntity[], DomainError>> {
    const tipos = await this.tipoComponenteRepo.findAllActive();
    return Result.ok(tipos);
  }
}
