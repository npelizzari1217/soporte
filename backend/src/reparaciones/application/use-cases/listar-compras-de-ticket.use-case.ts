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
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { comprasQueBloquean } from '../../domain/services/bloqueo-reparacion';
import { esCompraVisiblePara } from '../../../compras/application/services/visibilidad-compra';

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
 *
 * Solo lista las compras que el actor ve por su tipo (odd/compras-por-tipo, S2, S4): LECTURA sobre
 * el tipo de la compra, o compra sin tipo. El bloqueo del ticket sigue contando todas: quien no ve
 * una compra que lo frena sabe que está bloqueado, como quien no tiene `COMPRAS:LECTURA` (L19).
 */
export class ListarComprasDeTicketUseCase {
  constructor(
    private readonly reparacionCompraRepo: Pick<
      ITicketCompraRepository,
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
      vinculadas
        .filter((compra) => esCompraVisiblePara(compra, alcance))
        .map((compra) => ({
          compraId: compra.compraId,
          numero: compra.numero,
          grupo: derivarGrupoEstadoCompra(compra),
          bloquea: bloqueantes.has(compra.compraId),
        })),
    );
  }
}
