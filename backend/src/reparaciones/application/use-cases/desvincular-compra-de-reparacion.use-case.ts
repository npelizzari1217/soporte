import { DomainError, Result } from '../../../shared/domain/result';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import {
  CompraNoEncontradaError,
  VinculoNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { esCompraVisiblePara } from '../../../compras/application/services/visibilidad-compra';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
} from '../../../tickets/application/services/visibilidad-ticket';
import {
  esAlcanceDeAdministrador,
  verificarTicketModificable,
} from '../../../tickets/application/services/solo-comentarios';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';

/** DTO de entrada para desvincular una compra de un ticket. */
export interface DesvincularCompraDeReparacionDto {
  /** UUID del ticket, de cualquier tipo, del que se desvincula la compra. */
  ticketId: string;
  /** UUID de la compra a desvincular. */
  compraId: string;
  /** Permisos por tipo del actor (odd/permisos-por-tipo-ticket, D5 c). */
  alcance: AlcanceActorTicket;
}

/**
 * DesvincularCompraDeReparacionUseCase — elimina (HARD DELETE real, D5) el vínculo entre un ticket
 * y una compra (sdd/reparacion-bloqueada-por-compra, WU5; desde odd/ticket-unificado, S1, el
 * vínculo es del ticket). El nombre es el heredado; T4 lo renombra.
 *
 * Exige ver el ticket (404 si no) y `MODIFICACION` sobre su tipo (403; odd/ticket-unificado, S4).
 * Con el ticket RESUELTO, CERRADO o CANCELADO, quien no es ADMINISTRADOR ni ROOT recibe
 * `TicketSoloComentariosError` (422, odd/cerrado-solo-comentarios S5).
 * La celda de módulo `EDILICIA:BORRADO` que exigía la ruta antes dejó de usarse; la ruta exige
 * `COMPRAS:LECTURA`, como al vincular.
 *
 * Verifica existencia ANTES de borrar reusando `findComprasVinculadasByTicketIds`:
 * `ITicketCompraRepository.desvincular` hace un `deleteMany` silencioso que no informa si borró
 * algo, así que sin este chequeo un vínculo inexistente respondería 204 en vez de 404.
 *
 * Sin throw para fallos esperados — se modela con `Result.fail()`.
 */
export class DesvincularCompraDeReparacionUseCase {
  constructor(
    private readonly reparacionCompraRepo: Pick<
      ITicketCompraRepository,
      'findComprasVinculadasByTicketIds' | 'desvincular'
    >,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
  ) {}

  /**
   * @param dto Ticket, compra y alcance del actor.
   * @returns Ok; 404 si el ticket no existe, el actor no lo ve, el vínculo no existe o la compra es
   *   de un tipo que el actor no ve; 403 sin
   *   `MODIFICACION` sobre el tipo.
   */
  async execute(dto: DesvincularCompraDeReparacionDto): Promise<Result<void, DomainError>> {
    const acceso = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto.alcance,
      'MODIFICACION',
    );
    if (acceso.isFail()) {
      return Result.fail(acceso.getError());
    }
    const modificable = await verificarTicketModificable(
      this.estadoRepo,
      acceso.getValue(),
      esAlcanceDeAdministrador(dto.alcance),
    );
    if (modificable.isFail()) return Result.fail(modificable.getError());

    const vinculadas =
      (await this.reparacionCompraRepo.findComprasVinculadasByTicketIds([dto.ticketId])).get(
        dto.ticketId,
      ) ?? [];
    const vinculada = vinculadas.find((compra) => compra.compraId === dto.compraId);
    if (!vinculada) {
      return Result.fail(new VinculoNoEncontradoError(dto.ticketId, dto.compraId));
    }
    // Una compra de un tipo que el actor no ve responde como inexistente, igual que al vincular
    // (odd/compras-por-tipo, S2): ni se desvincula ni se confirma que exista.
    if (!esCompraVisiblePara(vinculada, dto.alcance)) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    await this.reparacionCompraRepo.desvincular(dto.ticketId, dto.compraId);

    return Result.ok(undefined);
  }
}
