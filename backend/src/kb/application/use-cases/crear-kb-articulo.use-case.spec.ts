/**
 * K3 [UNIT][RED→GREEN] — CrearKbArticuloUseCase: crea un artículo con
 * `autorId=actor.sub` (K1).
 *
 * Ref spec: sdd/premium/spec K1. Tarea: K3/K4.
 */
import { CrearKbArticuloUseCase } from './crear-kb-articulo.use-case';
import { TituloVacioError, ContenidoVacioError } from '../../domain/errors/kb.errors';

describe('CrearKbArticuloUseCase', () => {
  function buildUseCase() {
    const repo = { save: vi.fn() };
    const useCase = new CrearKbArticuloUseCase(repo as never);
    return { useCase, repo };
  }

  it('[CRITICAL] crea el artículo con autorId=actor.sub y lo persiste', async () => {
    const { useCase, repo } = buildUseCase();

    const result = await useCase.execute({
      titulo: 'Cómo resetear tu contraseña',
      contenido: 'Pasos...',
      autorId: 'actor-uuid',
    });

    expect(result.isOk()).toBe(true);
    const articulo = result.getValue();
    expect(articulo.titulo).toBe('Cómo resetear tu contraseña');
    expect(articulo.autorId).toBe('actor-uuid');
    expect(articulo.visibleParaSolicitante).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(articulo);
  });

  it('[CRITICAL] retorna TituloVacioError sin persistir si titulo es vacío', async () => {
    const { useCase, repo } = buildUseCase();

    const result = await useCase.execute({
      titulo: '   ',
      contenido: 'Pasos...',
      autorId: 'actor-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TituloVacioError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('[CRITICAL] retorna ContenidoVacioError sin persistir si contenido es vacío', async () => {
    const { useCase, repo } = buildUseCase();

    const result = await useCase.execute({
      titulo: 'Título',
      contenido: '',
      autorId: 'actor-uuid',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ContenidoVacioError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
