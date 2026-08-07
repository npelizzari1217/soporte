import { SlaConfigEntity } from '../../domain/entities/sla-config.entity';
import { ISlaConfigRepository } from '../../domain/ports/i-sla-config.repository';

/**
 * ListarSlaConfigUseCase — retorna todas las filas de `sla_config` del
 * tenant activo (S1, lectura). Sin filtros: son 4 filas fijas (una por
 * prioridad).
 *
 * Ref spec: sdd/premium/spec S1. Tarea: SA4/SA5.
 */
export class ListarSlaConfigUseCase {
  constructor(private readonly repo: Pick<ISlaConfigRepository, 'findAll'>) {}

  async execute(): Promise<SlaConfigEntity[]> {
    return this.repo.findAll();
  }
}
