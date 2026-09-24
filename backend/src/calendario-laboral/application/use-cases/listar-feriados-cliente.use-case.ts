import { DomainError, Result } from '../../../shared/domain/result';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { IFeriadoClienteRepository } from '../../domain/ports/i-feriado-cliente.repository';

/**
 * ListarFeriadosClienteUseCase — lista el calendario de feriados propios del
 * TENANT (`feriados_cliente`), ordenado por `fecha` ascendente (el orden ya
 * lo garantiza `IFeriadoClienteRepository.listar()`, WU3a).
 *
 * Mismo shape que `ListarFeriadosGlobalesUseCase` (WU2), distinto repositorio
 * y distinta DB (tenant en vez de master). Sin fallos esperados — mantiene
 * `Result` por consistencia con el resto del módulo.
 *
 * Ref: sdd/feriados-configurables, tarea 4.1 (WU4a).
 */
export class ListarFeriadosClienteUseCase {
  constructor(private readonly feriadoRepo: Pick<IFeriadoClienteRepository, 'listar'>) {}

  async execute(): Promise<Result<FeriadoEntity[], DomainError>> {
    const feriados = await this.feriadoRepo.listar();
    return Result.ok(feriados);
  }
}
