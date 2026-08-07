import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';

/**
 * ListarCiclosVigentesUseCase — `GET /ciclos-vigentes` (sdd/beta-frontend
 * item 4, cierra el gap G6 descubierto en B4: `AdoptarCicloForm` pedía
 * `cicloVigenteId` como texto libre por falta de este catálogo).
 *
 * Lista SOLO los ciclos ACTIVOS del catálogo global master — un ciclo
 * inactivo/soft-deleted no debería ofrecerse para adopción por un tenant
 * nuevo (mismo criterio implícito de `ElegirCicloTenantUseCase`, que valida
 * elegibilidad al momento de adoptar).
 */
export class ListarCiclosVigentesUseCase {
  constructor(private readonly cicloVigenteRepo: Pick<ICicloVigenteRepository, 'findAllActivos'>) {}

  async execute(): Promise<CicloVigenteEntity[]> {
    return this.cicloVigenteRepo.findAllActivos();
  }
}
