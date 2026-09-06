import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';
import { IFamiliaInsumoRepository } from '../../domain/ports/i-familia-insumo.repository';

/**
 * ListarFamiliasInsumoUseCase — catálogo de familias de insumo del tenant,
 * habilitadas y deshabilitadas. Sin gate: cualquier autenticado del tenant
 * puede leerlo (lo necesita para clasificar y buscar insumos).
 */
export class ListarFamiliasInsumoUseCase {
  constructor(private readonly familiaRepo: Pick<IFamiliaInsumoRepository, 'findAllActive'>) {}

  /** @returns Las familias del tenant —habilitadas o no—, ordenadas por código. */
  async execute(): Promise<FamiliaInsumoEntity[]> {
    return this.familiaRepo.findAllActive();
  }
}
