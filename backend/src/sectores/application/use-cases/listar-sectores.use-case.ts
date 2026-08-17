import { SectorEntity } from '../../domain/entities/sector.entity';
import { ISectorRepository } from '../../domain/ports/i-sector.repository';

/**
 * ListarSectoresUseCase — catálogo activo de sectores del tenant (R10, S65).
 * Sin gate: cualquier autenticado del tenant puede leerlo.
 */
export class ListarSectoresUseCase {
  constructor(private readonly sectorRepo: Pick<ISectorRepository, 'findAllActive'>) {}

  async execute(): Promise<SectorEntity[]> {
    return this.sectorRepo.findAllActive();
  }
}
