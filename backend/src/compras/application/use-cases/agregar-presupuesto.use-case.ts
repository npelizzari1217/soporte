import { DomainError, Result } from '../../../shared/domain/result';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';

/** DTO de entrada para agregar un presupuesto de proveedor (F3-C3). */
export interface AgregarPresupuestoDto {
  /** UUID del ticket_compra (de la URL). */
  ticketCompraId: string;
  proveedor: string;
  montoTotal: number;
  /** Código ISO 4217: ARS, USD, EUR. */
  moneda: string;
  fechaCotizacion: Date;
  observaciones?: string | null;
}

/**
 * AgregarPresupuestoUseCase — agrega una cotización de proveedor a un
 * ticket de compra (F3-C3).
 *
 * Flujo:
 * 1. Verifica que el `ticket_compra` exista y no esté soft-deleted.
 * 2. Crea `PresupuestoEntity` con validación de dominio (moneda ISO 4217,
 *    `montoTotal >= 0`), `seleccionado=false` por default.
 * 3. Persiste. La selección se hace después vía
 *    `SeleccionarPresupuestoUseCase` (ADR-7).
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Tarea: T4.5.
 */
export class AgregarPresupuestoUseCase {
  constructor(
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'findById'>,
    private readonly presupuestoRepo: Pick<IPresupuestoRepository, 'save'>,
  ) {}

  async execute(dto: AgregarPresupuestoDto): Promise<Result<PresupuestoEntity, DomainError>> {
    const ticketCompra = await this.ticketCompraRepo.findById(dto.ticketCompraId);
    if (!ticketCompra || ticketCompra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.ticketCompraId));
    }

    const presupuestoResult = PresupuestoEntity.create({
      ticketCompraId: dto.ticketCompraId,
      proveedor: dto.proveedor,
      montoTotal: dto.montoTotal,
      moneda: dto.moneda,
      fechaCotizacion: dto.fechaCotizacion,
      seleccionado: false,
      observaciones: dto.observaciones ?? null,
    });
    if (presupuestoResult.isFail()) {
      return Result.fail(presupuestoResult.getError());
    }
    const presupuesto = presupuestoResult.getValue();

    await this.presupuestoRepo.save(presupuesto);
    return Result.ok(presupuesto);
  }
}
