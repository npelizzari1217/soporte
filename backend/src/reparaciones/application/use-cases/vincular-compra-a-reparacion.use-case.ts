import { DomainError, Result } from '../../../shared/domain/result';
import { ICompraRepository } from '../../../compras/domain/ports/i-compra.repository';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IReparacionCompraRepository } from '../../domain/ports/i-reparacion-compra.repository';
import {
  TicketEdiliciaNoEncontradoError,
  CompraNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';

/** DTO de entrada para vincular una compra a una reparación. */
export interface VincularCompraAReparacionDto {
  /** UUID del `ticket_edilicia` (la reparación) a la que se vincula la compra. */
  ticketEdiliciaId: string;
  /** UUID de la compra a vincular. */
  compraId: string;
}

/**
 * VincularCompraAReparacionUseCase — crea el vínculo entre una reparación y
 * una compra existente del mismo tenant (sdd/reparacion-bloqueada-por-compra,
 * WU5).
 *
 * Flujo:
 * 1. Verifica que la reparación (`ticket_edilicia`) exista → 404
 *    (`TicketEdiliciaNoEncontradoError`) si no existe o está eliminada.
 * 2. Verifica que la compra exista (D7: vía `ICompraRepository.findByIdConItems`,
 *    puerto de OTRO módulo, importado por token — sin cambiar su firma) → 404
 *    (`CompraNoEncontradaError`) si `findByIdConItems` devuelve `null`.
 * 3. Delega el INSERT al puerto de vínculo (`IReparacionCompraRepository.vincular`),
 *    que es IDEMPOTENTE por construcción (D4: `ON CONFLICT DO NOTHING` sobre
 *    la UNIQUE de `reparacion_compra`) — este caso de uso NO hace
 *    check-then-insert propio, delega la idempotencia al repositorio.
 *
 * Sin throw para fallos esperados — se modelan con `Result.fail()`.
 *
 * Ref design: sdd/reparacion-bloqueada-por-compra/design, D4, D7. Ref tasks:
 * WU5.1, WU5.2.
 */
export class VincularCompraAReparacionUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
    private readonly compraRepo: Pick<ICompraRepository, 'findByIdConItems'>,
    private readonly reparacionCompraRepo: Pick<IReparacionCompraRepository, 'vincular'>,
  ) {}

  async execute(dto: VincularCompraAReparacionDto): Promise<Result<void, DomainError>> {
    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(dto.ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(dto.ticketEdiliciaId));
    }

    const compra = await this.compraRepo.findByIdConItems(dto.compraId);
    if (!compra) {
      return Result.fail(new CompraNoEncontradaError(dto.compraId));
    }

    await this.reparacionCompraRepo.vincular(dto.ticketEdiliciaId, dto.compraId);

    return Result.ok(undefined);
  }
}
