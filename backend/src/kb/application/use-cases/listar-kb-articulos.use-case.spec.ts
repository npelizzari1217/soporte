/**
 * K3 [UNIT][RED→GREEN] — ListarKbArticulosUseCase: scope de lectura por rol
 * (K3) — sin `KB:VER_TODOS` ⇒ soloVisibles=true, incluirInactivos=false;
 * staff ⇒ soloVisibles=false, incluirInactivos=true (ve todos).
 *
 * Ref spec: sdd/premium/spec K3. Ref design: ADR-P6. Tarea: K3/K4.
 */
import { ListarKbArticulosUseCase } from './listar-kb-articulos.use-case';

describe('ListarKbArticulosUseCase', () => {
  function buildUseCase() {
    const repo = { findAll: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
    const useCase = new ListarKbArticulosUseCase(repo as never);
    return { useCase, repo };
  }

  it('[CRITICAL] USUARIO (sin tienePermisoVerTodos): soloVisibles=true, incluirInactivos=false', async () => {
    const { useCase, repo } = buildUseCase();

    await useCase.execute({ tienePermisoVerTodos: false });

    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ soloVisibles: true, incluirInactivos: false }),
    );
  });

  it('[CRITICAL] staff (tienePermisoVerTodos): soloVisibles=false, incluirInactivos=true', async () => {
    const { useCase, repo } = buildUseCase();

    await useCase.execute({ tienePermisoVerTodos: true });

    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ soloVisibles: false, incluirInactivos: true }),
    );
  });

  it('aplica defaults de paginación (page=1, pageSize=20) y pasa busqueda', async () => {
    const { useCase, repo } = buildUseCase();

    await useCase.execute({
      tienePermisoVerTodos: true,
      busqueda: 'password',
    });

    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        busqueda: 'password',
      }),
    );
  });

  it('clampea pageSize a un máximo de 100', async () => {
    const { useCase, repo } = buildUseCase();

    await useCase.execute({ tienePermisoVerTodos: true, page: 2, pageSize: 500 });

    expect(repo.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 100 }));
  });

  it('retorna items + total del repo', async () => {
    const { useCase, repo } = buildUseCase();
    repo.findAll.mockResolvedValue({ items: [{ id: 'a' }], total: 1 });

    const result = await useCase.execute({ tienePermisoVerTodos: true });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
