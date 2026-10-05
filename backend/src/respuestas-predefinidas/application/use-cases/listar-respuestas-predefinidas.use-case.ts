import { RespuestaPredefinidaEntity } from '../../domain/entities/respuesta-predefinida.entity';
import { IRespuestaPredefinidaRepository } from '../../domain/ports/i-respuesta-predefinida.repository';

/**
 * ListarRespuestasPredefinidasUseCase — catálogo del tenant. Sin gate: cualquier autenticado
 * lo lee. El selector del comentario pide solo las activas; el ABM las pide todas para poder
 * reactivar.
 */
export class ListarRespuestasPredefinidasUseCase {
  constructor(private readonly repo: Pick<IRespuestaPredefinidaRepository, 'findAll'>) {}

  async execute(soloActivas: boolean): Promise<RespuestaPredefinidaEntity[]> {
    return this.repo.findAll(soloActivas);
  }
}
