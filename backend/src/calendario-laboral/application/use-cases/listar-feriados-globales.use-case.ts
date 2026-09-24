import { DomainError, Result } from '../../../shared/domain/result';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { IFeriadoGlobalRepository } from '../../domain/ports/i-feriado-global.repository';

/**
 * ListarFeriadosGlobalesUseCase — lista el calendario de feriados globales
 * (master `feriados`), ordenado por `fecha` ascendente (el orden ya lo
 * garantiza `IFeriadoGlobalRepository.listar()`, WU1).
 *
 * Sin fallos esperados — mantiene `Result` por consistencia con el resto del
 * módulo (mismo criterio que `ListarEquiposUseCase`).
 *
 * Ref: sdd/feriados-configurables, tarea 2.1.
 */
export class ListarFeriadosGlobalesUseCase {
  constructor(private readonly feriadoRepo: Pick<IFeriadoGlobalRepository, 'listar'>) {}

  async execute(): Promise<Result<FeriadoEntity[], DomainError>> {
    const feriados = await this.feriadoRepo.listar();
    return Result.ok(feriados);
  }
}
