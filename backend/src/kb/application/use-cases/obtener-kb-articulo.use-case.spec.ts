/**
 * K3 [UNIT][RED→GREEN] — ObtenerKbArticuloUseCase: scope de lectura por rol
 * (K3) — USUARIO (sin `ticket:ver_todos`) solo ve artículos
 * `visibleParaSolicitante=true` + `activo=true`; staff ve todos (incluye
 * internos e inactivos, para gestión).
 *
 * Ref spec: sdd/premium/spec K3. Tarea: K3/K4.
 */
import { ObtenerKbArticuloUseCase } from './obtener-kb-articulo.use-case';
import { KbArticuloEntity } from '../../domain/entities/kb-articulo.entity';
import { KbArticuloNoEncontradoError } from '../../domain/errors/kb.errors';

function buildArticulo(overrides: Partial<{ visibleParaSolicitante: boolean }> = {}) {
  return KbArticuloEntity.create(
    {
      titulo: 'Original',
      contenido: 'Contenido',
      tipoTicketId: null,
      autorId: 'autor-uuid',
      visibleParaSolicitante: overrides.visibleParaSolicitante ?? false,
      activo: true,
    },
    'articulo-uuid',
  );
}

describe('ObtenerKbArticuloUseCase', () => {
  function buildUseCase(articulo: KbArticuloEntity | null) {
    const repo = { findById: vi.fn().mockResolvedValue(articulo) };
    const useCase = new ObtenerKbArticuloUseCase(repo as never);
    return { useCase, repo };
  }

  it('[CRITICAL] staff (tienePermisoVerTodos) ve un artículo interno (no visible)', async () => {
    const articulo = buildArticulo({ visibleParaSolicitante: false });
    const { useCase } = buildUseCase(articulo);

    const result = await useCase.execute({
      id: 'articulo-uuid',
      tienePermisoVerTodos: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBe('articulo-uuid');
  });

  it('[CRITICAL] USUARIO ve un artículo publicado (visibleParaSolicitante=true)', async () => {
    const articulo = buildArticulo({ visibleParaSolicitante: true });
    const { useCase } = buildUseCase(articulo);

    const result = await useCase.execute({
      id: 'articulo-uuid',
      tienePermisoVerTodos: false,
    });

    expect(result.isOk()).toBe(true);
  });

  it('[CRITICAL] USUARIO NO ve un artículo interno (404, no revela existencia)', async () => {
    const articulo = buildArticulo({ visibleParaSolicitante: false });
    const { useCase } = buildUseCase(articulo);

    const result = await useCase.execute({
      id: 'articulo-uuid',
      tienePermisoVerTodos: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
  });

  it('retorna 404 si el id no existe', async () => {
    const { useCase } = buildUseCase(null);

    const result = await useCase.execute({ id: 'inexistente', tienePermisoVerTodos: true });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
  });

  it('retorna 404 si el artículo está soft-deleted, incluso para staff', async () => {
    const articulo = buildArticulo();
    articulo.eliminar();
    const { useCase } = buildUseCase(articulo);

    const result = await useCase.execute({ id: 'articulo-uuid', tienePermisoVerTodos: true });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(KbArticuloNoEncontradoError);
  });
});
