import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { IUnidadMedidaRepository } from '../../domain/ports/i-unidad-medida.repository';

/**
 * ListarUnidadesMedidaUseCase — catálogo de unidades de medida del tenant,
 * habilitadas y deshabilitadas. Sin gate: cualquier autenticado del tenant
 * puede leerlo (lo necesita para cargar y consultar insumos).
 */
export class ListarUnidadesMedidaUseCase {
  constructor(private readonly unidadRepo: Pick<IUnidadMedidaRepository, 'findAllActive'>) {}

  /** @returns Las unidades del tenant —habilitadas o no—, ordenadas por código. */
  async execute(): Promise<UnidadMedidaEntity[]> {
    return this.unidadRepo.findAllActive();
  }
}
