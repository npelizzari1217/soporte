import { DomainError, Result } from '../../../shared/domain/result';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { TicketCompraNoEncontradoError } from '../../domain/errors/compras.errors';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';

/**
 * DTO de entrada para agregar un presupuesto de proveedor a un ticket de compra.
 */
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
 * AgregarPresupuestoUseCase — agrega un presupuesto de proveedor a un ticket de compra.
 *
 * Flujo:
 * 1. Verifica que el ticket_compra existe y no está soft-deleted.
 * 2. Crea la entidad PresupuestoEntity con validación de moneda ISO 4217.
 * 3. Persiste el nuevo presupuesto.
 * 4. Retorna Result.ok(PresupuestoEntity).
 *
 * El presupuesto se crea con seleccionado = false (default).
 * La selección se realiza mediante SeleccionarPresupuestoUseCase.
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Tabla presupuestos, Selección única de presupuesto]
 * Tarea: 4.D.2
 */
export class AgregarPresupuestoUseCase {
  constructor(
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly presupuestoRepo: IPresupuestoRepository,
  ) {}

  async execute(dto: AgregarPresupuestoDto): Promise<Result<PresupuestoEntity, DomainError>> {
    // 1. Verificar que el ticket_compra existe
    const ticketCompra = await this.ticketCompraRepo.findById(dto.ticketCompraId);
    if (!ticketCompra || ticketCompra.isDeleted()) {
      return Result.fail(new TicketCompraNoEncontradoError(dto.ticketCompraId));
    }

    // 2. Crear la entidad con validación de dominio (moneda ISO 4217)
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

    // 3. Persistir
    await this.presupuestoRepo.save(presupuesto);

    return Result.ok(presupuesto);
  }
}
