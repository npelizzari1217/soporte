import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';

/**
 * ListarTiposComponenteAdminUseCase — `GET /tipos-componente/admin`,
 * exclusivo de ROOT. Lista TODOS los tipos de componente del catálogo
 * MASTER, incluyendo inactivos — la pantalla ABM de ROOT necesita ver el
 * catálogo completo para poder reactivar/desactivar cualquier tipo.
 *
 * Tarea: sdd/tipos-componente-master (PR2 — ABM del catálogo maestro).
 */
export class ListarTiposComponenteAdminUseCase {
  constructor(private readonly repo: Pick<ITipoComponenteMasterRepository, 'findAll'>) {}

  async execute(): Promise<TipoComponente[]> {
    return this.repo.findAll();
  }
}
