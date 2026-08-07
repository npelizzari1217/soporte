/**
 * K3 [UNIT][RED→GREEN] — EliminarKbArticuloUseCase: soft delete (K1).
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K3/K4.
 */
import { EliminarKbArticuloUseCase } from './eliminar-kb-articulo.use-case';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';

function buildArticulo() {
  return KbArticuloEntity.create(
    {
      titulo: 'Original',
      contenido: 'Contenido',
      tipoTicketId: null,
      autorId: 'autor-uuid',
      visibleParaSolicitante: false,
      activo: true,
    },
    'articulo-uuid',
  );
}

describe('EliminarKbArticuloUseCase', () => {
  function buildUseCase(articulo: KbArticuloEntity | null) {
    const repo = { findById: vi.fn().mockResolvedValue(articulo), softDelete: vi.fn() };
    const useCase = new EliminarKbArticuloUseCase(repo as never);
    return { useCase, repo };
  }

  it('[CRITICAL] soft-elimina el artículo existente', async () => {
    const articulo = buildArticulo();
    const { useCase, repo } = buildUseCase(articulo);

    const result = await useCase.execute({ id: 'articulo-uuid' });

    expect(result.isOk()).toBe(true);
    expect(repo.softDelete).toHaveBeenCalledWith('articulo-uuid');
  });

  it('[CRITICAL] retorna KbArticuloNoEncontradoError si el id no existe', async () => {
    const { useCase, repo } = buildUseCase(null);

    const result = await useCase.execute({ id: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('retorna KbArticuloNoEncontradoError si el artículo ya está soft-deleted', async () => {
    const articulo = buildArticulo();
    articulo.eliminar();
    const { useCase, repo } = buildUseCase(articulo);

    const result = await useCase.execute({ id: 'articulo-uuid' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});
