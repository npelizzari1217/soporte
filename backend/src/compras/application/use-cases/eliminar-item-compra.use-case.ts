import { DomainError, Result } from '../../../shared/domain/result';
import { ItemNoEncontradoError } from '../../domain/errors/compras.errors';
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';

/** DTO de entrada para eliminar (soft delete) un ítem de compra (F3-C2). */
export interface EliminarItemCompraDto {
  /** UUID del ítem de compra a eliminar. */
  itemId: string;
}

/**
 * EliminarItemCompraUseCase — baja lógica de un ítem de compra (F3-C2).
 *
 * Flujo:
 * 1. Verifica que el ítem exista y no esté ya eliminado.
 * 2. Ejecuta soft delete vía `repo.delete()` — NUNCA DELETE físico.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C2. Tarea: T4.3.
 */
export class EliminarItemCompraUseCase {
  constructor(
    private readonly itemCompraRepo: Pick<IItemCompraRepository, 'findById' | 'delete'>,
  ) {}

  async execute(dto: EliminarItemCompraDto): Promise<Result<void, DomainError>> {
    const item = await this.itemCompraRepo.findById(dto.itemId);
    if (!item || item.isDeleted()) {
      return Result.fail(new ItemNoEncontradoError(dto.itemId));
    }

    await this.itemCompraRepo.delete(dto.itemId);
    return Result.ok(undefined);
  }
}
