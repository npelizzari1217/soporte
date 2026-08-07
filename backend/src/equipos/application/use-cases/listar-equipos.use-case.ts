import { DomainError, Result } from '../../../shared/domain/result';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { IEquipoInformaticoRepository } from '../../domain/ports/i-equipo-informatico.repository';

/**
 * ListarEquiposUseCase — lista los equipos activos del inventario del
 * tenant (F3-Q1).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1. Tarea: T12.2.
 */
export class ListarEquiposUseCase {
  constructor(private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findAllActive'>) {}

  async execute(): Promise<Result<EquipoInformaticoEntity[], DomainError>> {
    const equipos = await this.equipoRepo.findAllActive();
    return Result.ok(equipos);
  }
}
