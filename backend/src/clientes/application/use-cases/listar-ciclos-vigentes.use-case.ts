import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';

/**
 * ListarCiclosVigentesUseCase — lista el catálogo global de ciclos vigentes
 * (no soft-deleted). Incluye ciclos con activo=false; el filtrado por
 * "incluir inactivos" no aplica en este scope (T2.3).
 *
 * Satisface: GET /ciclos-vigentes.
 *
 * Tarea: T2.3
 */
export class ListarCiclosVigentesUseCase {
  constructor(private readonly cicloRepo: ICicloVigenteRepository) {}

  async execute(): Promise<CicloVigenteEntity[]> {
    return this.cicloRepo.findAllNonDeleted();
  }
}
