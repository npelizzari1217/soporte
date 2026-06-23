import { DomainError, Result } from '../../../shared/domain/result';
import { ItemCompraNoEncontradoError } from '../../domain/errors/compras.errors';
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';

/**
 * DTO de entrada para eliminar (soft-delete) un ítem de compra.
 */
export interface EliminarItemCompraDto {
  /** UUID del ítem de compra a eliminar. */
  itemId: string;
}

/**
 * EliminarItemCompraUseCase — baja lógica de un ítem de compra.
 *
 * Flujo:
 * 1. Verifica que el ítem existe y no está ya eliminado.
 * 2. Ejecuta soft delete vía repo.delete().
 * 3. Retorna Result.ok(undefined).
 *
 * Sin throw — todos los fallos esperados retornan Result.fail().
 *
 * Ref spec: [SPEC:compras/Soft delete de ítem no elimina físicamente]
 * Tarea: 4.D.2
 */
export class EliminarItemCompraUseCase {
  constructor(private readonly itemCompraRepo: IItemCompraRepository) {}

  async execute(dto: EliminarItemCompraDto): Promise<Result<void, DomainError>> {
    // 1. Verificar que el ítem existe
    const item = await this.itemCompraRepo.findById(dto.itemId);
    if (!item || item.isDeleted()) {
      return Result.fail(new ItemCompraNoEncontradoError(dto.itemId));
    }

    // 2. Soft delete
    await this.itemCompraRepo.delete(dto.itemId);

    return Result.ok(undefined);
  }
}
