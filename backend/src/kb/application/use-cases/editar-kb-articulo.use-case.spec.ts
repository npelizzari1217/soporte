/**
 * K3 [UNIT][RED→GREEN] — EditarKbArticuloUseCase: PATCH semántico de
 * titulo/contenido/tipoTicketId (K1).
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K3/K4.
 */
import { EditarKbArticuloUseCase } from './editar-kb-articulo.use-case';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { KbArticuloNoEncontradoError, TituloVacioError } from '../../domain/errors/kb.errors';

function buildArticulo() {
  return KbArticuloEntity.create(
    {
      titulo: 'Original',
      contenido: 'Contenido original',
      tipoTicketId: null,
      autorId: 'autor-uuid',
      visibleParaSolicitante: false,
      activo: true,
    },
    'articulo-uuid',
  );
}

describe('EditarKbArticuloUseCase', () => {
  function buildUseCase(articulo: KbArticuloEntity | null) {
    const repo = { findById: vi.fn().mockResolvedValue(articulo), save: vi.fn() };
    const useCase = new EditarKbArticuloUseCase(repo as never);
    return { useCase, repo };
  }

  it('[CRITICAL] edita titulo/contenido y persiste', async () => {
    const articulo = buildArticulo();
    const { useCase, repo } = buildUseCase(articulo);

    const result = await useCase.execute({
      id: 'articulo-uuid',
      titulo: 'Editado',
      contenido: 'Contenido editado',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().titulo).toBe('Editado');
    expect(repo.save).toHaveBeenCalledWith(articulo);
  });

  it('[CRITICAL] retorna KbArticuloNoEncontradoError si el id no existe', async () => {
    const { useCase, repo } = buildUseCase(null);

    const result = await useCase.execute({ id: 'inexistente', titulo: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('[CRITICAL] retorna TituloVacioError sin persistir si titulo editado es vacío', async () => {
    const articulo = buildArticulo();
    const { useCase, repo } = buildUseCase(articulo);

    const result = await useCase.execute({ id: 'articulo-uuid', titulo: '  ' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TituloVacioError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
