import { DomainError, Result } from '../../../shared/domain/result';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';

/** DTO de entrada para agregar un ítem a un ticket de compra (F3-C2). */
export interface AgregarItemCompraDto {
  /** UUID del ticket_compra al que se agrega el ítem (de la URL). */
  ticketCompraId: string;
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
  precioUnitarioRef?: number | null;
  observaciones?: string | null;
}

/**
 * AgregarItemCompraUseCase — agrega un ítem a un ticket de compra existente
 * (F3-C2).
 *
 * Flujo:
 * 1. Verifica que el `ticket_compra` exista y no esté soft-deleted.
 * 2. Crea `ItemCompraEntity` con validación de dominio (`cantidad > 0`).
 * 3. Persiste el nuevo ítem.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C2. Tarea: T4.3.
 */
export class AgregarItemCompraUseCase {
  constructor(
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'findById'>,
    private readonly itemCompraRepo: Pick<IItemCompraRepository, 'save'>,
  ) {}

  async execute(dto: AgregarItemCompraDto): Promise<Result<ItemCompraEntity, DomainError>> {
    const ticketCompra = await this.ticketCompraRepo.findById(dto.ticketCompraId);
    if (!ticketCompra || ticketCompra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(dto.ticketCompraId));
    }

    const itemResult = ItemCompraEntity.create({
      ticketCompraId: dto.ticketCompraId,
      descripcion: dto.descripcion,
      cantidad: dto.cantidad,
      unidad: dto.unidad ?? null,
      precioUnitarioRef: dto.precioUnitarioRef ?? null,
      observaciones: dto.observaciones ?? null,
    });
    if (itemResult.isFail()) {
      return Result.fail(itemResult.getError());
    }
    const item = itemResult.getValue();

    await this.itemCompraRepo.save(item);
    return Result.ok(item);
  }
}
