import { DomainError, Result } from '../../../shared/domain/result';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';

/**
 * ListarEstadosUseCase — lista el catálogo FIJO de estados ACTIVOS del
 * tenant. Cierra el gap G1 (sdd/beta-frontend/spec §3): desbloquea la barra
 * de filtros de tickets y los labels de estado en lista/detalle. Cualquier
 * usuario autenticado del tenant puede listarlo — catálogo de solo lectura
 * (spec T1: sin endpoints de alta/baja/edición de estados).
 *
 * Ref spec: sdd/beta-frontend/spec §3 G1. Ref design: ADR-5.
 */
export class ListarEstadosUseCase {
  constructor(private readonly estadoRepo: Pick<IEstadoRepository, 'findAllActive'>) {}

  async execute(): Promise<Result<EstadoEntity[], DomainError>> {
    const estados = await this.estadoRepo.findAllActive();
    return Result.ok(estados);
  }
}
