/**
 * K3 [UNIT][RED→GREEN] — CambiarVisibilidadKbArticuloUseCase: publicar
 * (visible=true) / despublicar (visible=false), K2.
 *
 * Ref spec: sdd/premium/spec K2. Tarea: K3/K4.
 */
import { CambiarVisibilidadKbArticuloUseCase } from './cambiar-visibilidad-kb-articulo.use-case';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';

function buildArticulo() {
  return KbArticuloEntity.create(
    {
      titulo: 'Original',
      contenido: 'Contenido',
      autorId: 'autor-uuid',
      visibleParaSolicitante: false,
      activo: true,
    },
    'articulo-uuid',
  );
}

describe('CambiarVisibilidadKbArticuloUseCase', () => {
  function buildUseCase(articulo: KbArticuloEntity | null) {
    const repo = { findById: vi.fn().mockResolvedValue(articulo), save: vi.fn() };
    const useCase = new CambiarVisibilidadKbArticuloUseCase(repo as never);
    return { useCase, repo };
  }

  it('[CRITICAL] publicar(true) setea visibleParaSolicitante=true y persiste', async () => {
    const articulo = buildArticulo();
    const { useCase, repo } = buildUseCase(articulo);

    const result = await useCase.execute({ id: 'articulo-uuid', visible: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().visibleParaSolicitante).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(articulo);
  });

  it('despublicar (visible=false) setea visibleParaSolicitante=false', async () => {
    const articulo = KbArticuloEntity.create(
      {
        titulo: 'Original',
        contenido: 'Contenido',
        autorId: 'autor-uuid',
        visibleParaSolicitante: true,
        activo: true,
      },
      'articulo-uuid',
    );
    const { useCase } = buildUseCase(articulo);

    const result = await useCase.execute({ id: 'articulo-uuid', visible: false });

    expect(result.getValue().visibleParaSolicitante).toBe(false);
  });

  it('[CRITICAL] retorna KbArticuloNoEncontradoError si el id no existe', async () => {
    const { useCase, repo } = buildUseCase(null);

    const result = await useCase.execute({ id: 'inexistente', visible: true });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
