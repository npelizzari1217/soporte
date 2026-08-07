/**
 * T4.3 [UNIT] — RED→GREEN: `EliminarItemCompraUseCase`.
 *
 * Baja lógica (soft delete) de un ítem de compra — NUNCA DELETE físico
 * (F3-C2).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C2. Tarea: T4.3.
 */
import { EliminarItemCompraUseCase } from './eliminar-item-compra.use-case';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { ItemNoEncontradoError } from '../../domain/errors/compras.errors';

describe('EliminarItemCompraUseCase', () => {
  function makeCollaborators() {
    const item = ItemCompraEntity.create(
      {
        ticketCompraId: 'ticket-compra-uuid',
        descripcion: 'Item a borrar',
        cantidad: 1,
        unidad: null,
        precioUnitarioRef: null,
        observaciones: null,
      },
      'item-uuid',
    ).getValue();

    const itemCompraRepo = {
      findById: vi.fn().mockResolvedValue(item),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new EliminarItemCompraUseCase(itemCompraRepo as never);
    return { useCase, itemCompraRepo, item };
  }

  it('F3-C2: aplica soft delete (repo.delete), nunca DELETE fisico', async () => {
    const c = makeCollaborators();

    const result = await c.useCase.execute({ itemId: 'item-uuid' });

    expect(result.isOk()).toBe(true);
    expect(c.itemCompraRepo.delete).toHaveBeenCalledWith('item-uuid');
  });

  it('item inexistente → ItemNoEncontradoError', async () => {
    const c = makeCollaborators();
    c.itemCompraRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({ itemId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemNoEncontradoError);
    expect(c.itemCompraRepo.delete).not.toHaveBeenCalled();
  });

  it('item ya eliminado se trata como inexistente', async () => {
    const c = makeCollaborators();
    c.item.softDelete();

    const result = await c.useCase.execute({ itemId: 'item-uuid' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ItemNoEncontradoError);
  });
});
