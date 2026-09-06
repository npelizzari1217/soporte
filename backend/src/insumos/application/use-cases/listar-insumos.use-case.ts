import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { IInsumoRepository } from '../../domain/ports/i-insumo.repository';

/**
 * ListarInsumosUseCase — catálogo de insumos del tenant, habilitados y
 * deshabilitados, con sus códigos alternativos.
 *
 * No devuelve `Result`: no tiene ningún fallo de negocio que informar — un
 * catálogo sin filas es una lista vacía, no un error. Mismo criterio que
 * `ListarModelosEquipoUseCase`.
 *
 * Sin gate: cualquier autenticado del tenant puede leerlo, porque lo necesita
 * para elegir un insumo en cualquier otra pantalla.
 */
export class ListarInsumosUseCase {
  constructor(private readonly insumoRepo: Pick<IInsumoRepository, 'findAllActive'>) {}

  /** @returns Los insumos vigentes del tenant —habilitados o no—, ordenados por código. */
  async execute(): Promise<InsumoEntity[]> {
    return this.insumoRepo.findAllActive();
  }
}
