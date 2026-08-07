import { DomainError, Result } from '../../../shared/domain/result';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

/**
 * ListarTiposTicketUseCase — lista el catálogo de tipos de ticket ACTIVOS del
 * tenant. Cierra el gap G1 (sdd/beta-frontend/spec §3): desbloquea el form de
 * creación de ticket (select de tipo), la barra de filtros y la vista admin
 * de catálogos. Cualquier usuario autenticado del tenant puede listarlo (sin
 * `@RequirePermissions` en el controller) — es un catálogo de solo lectura.
 *
 * Ref spec: sdd/beta-frontend/spec §3 G1. Ref design: ADR-5.
 */
export class ListarTiposTicketUseCase {
  constructor(private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findAllActive'>) {}

  async execute(): Promise<Result<TipoTicketEntity[], DomainError>> {
    const tipos = await this.tipoTicketRepo.findAllActive();
    return Result.ok(tipos);
  }
}
