import { DomainError, Result } from '../../../shared/domain/result';
import {
  GrupoEstadoCompra,
  derivarGrupoEstadoCompra,
} from '../../../compras/domain/services/estado-compra';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
} from '../../../tickets/application/services/visibilidad-ticket';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';

/** Una compra vinculada a un ticket, con su grupo de estado y si frena hoy al ticket. */
export interface CompraDeTicket {
  compraId: string;
  numero: string;
  grupo: GrupoEstadoCompra;
  /** `true` si es una de las que bloquean el ticket (`comprasQueBloquean`). */
  bloquea: boolean;
}

/**
 * ListarComprasDeTicketUseCase — las compras vinculadas a un ticket de cualquier tipo
 * (odd/ticket-unificado, S1), ordenadas por número, sin las dadas de baja.
 *
 * Exige ver el ticket (`LECTURA` sobre su tipo y regla de fila): 404 si no. `COMPRAS:LECTURA` lo
 * exige la ruta (`TicketComprasController`, odd/ticket-unificado L19), que es donde vive el candado
 * de la matriz. El bloqueo sale de `comprasQueBloquean`, el criterio único del sistema.
 */
export class ListarComprasDeTicketUseCase {
  constructor(
    private readonly reparacionCompraRepo: Pick<
      IReparacionCompraRepository,
      'findComprasVinculadasByTicketIds'
    >,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
  ) {}

  /**
   * @param ticketId Id del ticket.
   * @param alcance Permisos por tipo del actor.
   * @returns Las compras vinculadas (`[]` si no tiene), o 404 si el actor no ve el ticket.
   */
  async execute(
    ticketId: string,
    alcance: AlcanceActorTicket,
  ): Promise<Result<CompraDeTicket[], DomainError>> {
    const acceso = await cargarTicketParaOperar(this.ticketRepo, ticketId, alcance);
    if (acceso.isFail()) return Result.fail(acceso.getError());

    const vinculadas =
      (await this.reparacionCompraRepo.findComprasVinculadasByTicketIds([ticketId])).get(
        ticketId,
      ) ?? [];
    const bloqueantes = new Set(comprasQueBloquean(vinculadas).map((compra) => compra.compraId));
    return Result.ok(
      vinculadas.map((compra) => ({
        compraId: compra.compraId,
        numero: compra.numero,
        grupo: derivarGrupoEstadoCompra(compra),
        bloquea: bloqueantes.has(compra.compraId),
      })),
    );
  }
}
