import { DomainError, Result } from '../../../shared/domain/result';
import { ITipoComponenteMasterChecker } from '../../domain/ports/i-tipo-componente-master.checker';

/** Item del catálogo READ-ONLY de tipos de componente (MASTER, PR3). */
export interface TipoComponenteCatalogoItem {
  codigo: string;
  nombre: string;
}

/**
 * ListarTiposComponenteUseCase — lista el catálogo READ-ONLY de tipos de
 * componente activos (F3-Q3), para poblar selectores de UI al agregar
 * componentes.
 *
 * Lee el catálogo desde MASTER vía `ITipoComponenteMasterChecker` (PR3,
 * sdd/tipos-componente-master) — antes leía `tipos_componente` tenant
 * (sembrado por tenant, PR1 legacy); el catálogo ahora es global.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q3. Tarea: T12.5, PR3.
 */
export class ListarTiposComponenteUseCase {
  constructor(
    private readonly tipoComponenteMasterChecker: Pick<
      ITipoComponenteMasterChecker,
      'listarActivos'
    >,
  ) {}

  async execute(): Promise<Result<TipoComponenteCatalogoItem[], DomainError>> {
    const tipos = await this.tipoComponenteMasterChecker.listarActivos();
    return Result.ok(tipos);
  }
}
