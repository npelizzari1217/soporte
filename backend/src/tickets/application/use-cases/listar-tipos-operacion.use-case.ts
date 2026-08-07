import { DomainError, Result } from '../../../shared/domain/result';
import { TipoOperacionEntity } from '../../domain/entities/tipo-operacion.entity';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';

/**
 * ListarTiposOperacionUseCase — lista el catálogo FIJO de tipos de operación
 * ACTIVOS del tenant (eventos del timeline). Expuesto a pedido explícito de
 * esta sesión (sdd/beta-frontend/apply-progress) además de G1 (tipos-ticket/
 * prioridades/estados) — útil para mapear/labelear el timeline en el front
 * sin hardcodear los 5 códigos fijos. Cualquier usuario autenticado del
 * tenant puede listarlo — catálogo de solo lectura.
 */
export class ListarTiposOperacionUseCase {
  constructor(
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findAllActive'>,
  ) {}

  async execute(): Promise<Result<TipoOperacionEntity[], DomainError>> {
    const tipos = await this.tipoOperacionRepo.findAllActive();
    return Result.ok(tipos);
  }
}
