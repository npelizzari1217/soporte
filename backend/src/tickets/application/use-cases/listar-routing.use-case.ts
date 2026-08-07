import {
  IUsuarioTiposTicketRepository,
  RoutingAsociacion,
} from '../../domain/ports/i-usuario-tipos-ticket.repository';

/**
 * ListarRoutingUseCase — `GET /routing` (sdd/beta-frontend item 5).
 *
 * Lista TODAS las asociaciones usuario↔tipo_ticket del tenant activo. Cierra
 * el gap documentado en apply-progress B4: `RoutingAdminView` operaba "a
 * ciegas" (solo POST/DELETE, sin lista para saber qué ya estaba asociado).
 */
export class ListarRoutingUseCase {
  constructor(private readonly repo: Pick<IUsuarioTiposTicketRepository, 'findAll'>) {}

  async execute(): Promise<RoutingAsociacion[]> {
    return this.repo.findAll();
  }
}
