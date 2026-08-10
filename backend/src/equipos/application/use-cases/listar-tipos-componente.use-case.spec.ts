import { describe, it, expect, vi } from 'vitest';
import { ListarTiposComponenteUseCase } from './listar-tipos-componente.use-case';

describe('ListarTiposComponenteUseCase', () => {
  it('retorna los tipos de componente activos del catálogo MASTER', async () => {
    const tipoComponenteMasterChecker = {
      listarActivos: vi.fn().mockResolvedValue([{ codigo: 'RAM', nombre: 'Memoria RAM' }]),
    };
    const useCase = new ListarTiposComponenteUseCase(tipoComponenteMasterChecker as never);

    const result = await useCase.execute();

    expect(tipoComponenteMasterChecker.listarActivos).toHaveBeenCalledOnce();
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([{ codigo: 'RAM', nombre: 'Memoria RAM' }]);
  });
});
