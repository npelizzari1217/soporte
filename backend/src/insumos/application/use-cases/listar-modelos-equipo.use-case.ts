import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';
import { IModeloEquipoRepository } from '../../domain/ports/i-modelo-equipo.repository';

/**
 * ListarModelosEquipoUseCase — catálogo de modelos de equipo del tenant,
 * habilitados y deshabilitados. Sin gate: cualquier autenticado del tenant
 * puede leerlo (lo necesita para elegir el modelo de un equipo y para consultar
 * la compatibilidad de insumos).
 */
export class ListarModelosEquipoUseCase {
  constructor(private readonly modeloRepo: Pick<IModeloEquipoRepository, 'findAllActive'>) {}

  /** @returns Los modelos del tenant —habilitados o no—, ordenados por marca y modelo. */
  async execute(): Promise<ModeloEquipoEntity[]> {
    return this.modeloRepo.findAllActive();
  }
}
