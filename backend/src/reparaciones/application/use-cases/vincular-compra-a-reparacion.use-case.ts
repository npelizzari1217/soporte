import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { ICompraRepository } from '../../../compras/domain/ports/i-compra.repository';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import { CompraNoEncontradaError } from '../../domain/errors/reparaciones.errors';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { bloquearTicketActivo } from '../../../tickets/application/services/bloquear-ticket-activo';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
} from '../../../tickets/application/services/visibilidad-ticket';

/** DTO de entrada para vincular una compra a un ticket. */
export interface VincularCompraAReparacionDto {
  /** UUID del ticket, de cualquier tipo, al que se vincula la compra. */
  ticketId: string;
  /** UUID de la compra a vincular. */
  compraId: string;
  /** Permisos por tipo del actor (odd/permisos-por-tipo-ticket, D5 c). */
  alcance: AlcanceActorTicket;
}

/**
 * VincularCompraAReparacionUseCase — crea el vínculo entre un ticket de cualquier tipo y una
 * compra existente del mismo tenant (sdd/reparacion-bloqueada-por-compra, WU5; desde
 * odd/ticket-unificado, S1, el vínculo es del ticket y no del satélite de Edilicia). El nombre es
 * el heredado; T4 lo renombra junto con el retiro del satélite.
 *
 * Flujo:
 * 1. Carga el ticket → 404 (`TicketNoEncontradoError`) si no existe, está borrado o el actor no lo
 *    ve; 403 sin `MODIFICACION` sobre su tipo (odd/ticket-unificado, S4: vincular una compra es
 *    modificar el ticket). `COMPRAS:LECTURA` lo exige la ruta: es un permiso de otro módulo.
 * 2. Verifica que la compra exista (D7: vía `ICompraRepository.findByIdConItems`, puerto de OTRO
 *    módulo, importado por token) → 404 (`CompraNoEncontradaError`).
 * 3. Delega el INSERT al puerto de vínculo, que es IDEMPOTENTE por construcción (D4: `ON CONFLICT
 *    DO NOTHING` sobre la UNIQUE de `ticket_compra`): este caso de uso NO hace check-then-insert.
 * 4. El INSERT corre en una transacción que toma el lock del ticket y lo relee
 *    (odd/permisos-por-tipo-ticket, L45): si se borró después de cargarlo → 404 y no vincula. El
 *    borrado toma el mismo lock y rechaza un ticket con compras vinculadas: sin el lock, un vínculo
 *    creado a la par quedaría colgado de un ticket borrado.
 *
 * Sin throw para fallos esperados — se modelan con `Result.fail()`.
 */
export class VincularCompraAReparacionUseCase {
  constructor(
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems'>,
    private readonly reparacionCompraRepo: Pick<IReparacionCompraRepository, 'vincular'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara' | 'bloquear'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  /**
   * @param dto Ticket, compra y alcance del actor.
   * @returns Ok; 404 si el ticket o la compra no existen o el actor no ve el ticket; 403 sin
   *   `MODIFICACION` sobre el tipo.
   */
  async execute(dto: VincularCompraAReparacionDto): Promise<Result<void, DomainError>> {
    const acceso = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto.alcance,
      'MODIFICACION',
    );
    if (acceso.isFail()) {
      return Result.fail(acceso.getError());
    }

    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    const vinculada = await this.txRunner.run(async () => {
      if (!(await bloquearTicketActivo(this.ticketRepo, dto.ticketId))) return false;
      await this.reparacionCompraRepo.vincular(dto.ticketId, dto.compraId);
      return true;
    });
    if (!vinculada) return Result.fail(new TicketNoEncontradoError(dto.ticketId));

    return Result.ok(undefined);
  }
}
