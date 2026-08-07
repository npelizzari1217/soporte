import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';

/**
 * ListarCiclosVigentesAdminUseCase — `GET /ciclos-vigentes/admin`
 * (sdd/ciclos-abm-root), exclusivo de ROOT.
 *
 * Lista TODOS los ciclos del catálogo global, incluyendo soft-deleted — a
 * diferencia de `ListarCiclosVigentesUseCase` (`findAllActivos`, usado por
 * el tenant para poblar el selector de adopción), la pantalla ABM de ROOT
 * necesita ver el catálogo completo para poder editar/dar de baja
 * cualquier ciclo, no solo los activos.
 */
export class ListarCiclosVigentesAdminUseCase {
  constructor(private readonly cicloVigenteRepo: Pick<ICicloVigenteRepository, 'findAll'>) {}

  async execute(): Promise<CicloVigenteEntity[]> {
    return this.cicloVigenteRepo.findAll();
  }
}
