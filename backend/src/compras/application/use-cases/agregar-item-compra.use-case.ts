import { DomainError, Result } from '../../../shared/domain/result';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import {
  ItemCompraNoEncontradoError,
  TicketCompraNoEncontradoError,
} from '../../domain/errors/compras.errors';
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';

// Re-export so controller doesn't have to import from errors directly.
export { ItemCompraNoEncontradoError };

/**
 * DTO de entrada para agregar un ítem a un ticket de compra.
 */
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
 * AgregarItemCompraUseCase — agrega un ítem a un ticket de compra existente.
 *
 * Flujo:
 * 1. Verifica que el ticket_compra existe y no está soft-deleted.
 * 2. Crea la entidad ItemCompra con validación de cantidad > 0.
 * 3. Persiste el nuevo ítem.
 * 4. Retorna Result.ok(ItemCompraEntity).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Gestión de ítems]
 * Tarea: 4.D.2
 */
export class AgregarItemCompraUseCase {
  constructor(
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly itemCompraRepo: IItemCompraRepository,
  ) {}

  async execute(dto: AgregarItemCompraDto): Promise<Result<ItemCompraEntity, DomainError>> {
    // 1. Verificar que el ticket_compra existe
    const ticketCompra = await this.ticketCompraRepo.findById(dto.ticketCompraId);
    if (!ticketCompra || ticketCompra.isDeleted()) {
      return Result.fail(new TicketCompraNoEncontradoError(dto.ticketCompraId));
    }

    // 2. Crear la entidad con validación de dominio (cantidad > 0)
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

    // 3. Persistir
    await this.itemCompraRepo.save(item);

    return Result.ok(item);
  }
}
