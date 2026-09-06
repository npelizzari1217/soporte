import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';

/**
 * ListarInsumosPorModeloEquipoUseCase — los insumos que le sirven a un modelo
 * de equipo. Es la consulta que responde "¿qué tóner le va a esta impresora?"
 * en UNA sola llamada, mirando la relación desde el lado del modelo.
 *
 * No devuelve `Result`: no tiene ningún fallo de negocio que informar — un
 * modelo sin insumos compatibles es una lista vacía, no un error, y tampoco lo
 * es un id que no existe en el catálogo (la consulta simplemente no encuentra
 * nada). Mismo criterio que `ListarInsumosUseCase`.
 *
 * Sin gate: cualquier autenticado del tenant puede leerlo, con el mismo
 * criterio que el listado del catálogo de modelos.
 */
export class ListarInsumosPorModeloEquipoUseCase {
  constructor(private readonly insumoRepo: Pick<IInsumoRepository, 'findAllByModeloEquipo'>) {}

  /**
   * @param modeloEquipoId Id del modelo de equipo por el que se consulta.
   * @returns Los insumos vigentes compatibles —habilitados o no—, ordenados por
   *   código, cada uno con su agregado completo.
   */
  async execute(modeloEquipoId: string): Promise<InsumoEntity[]> {
    return this.insumoRepo.findAllByModeloEquipo(modeloEquipoId);
  }
}
