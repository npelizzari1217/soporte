/**
 * [UNIT] RED→GREEN: `ListarRoutingUseCase` (sdd/beta-frontend item 5).
 */
import { ListarRoutingUseCase } from './listar-routing.use-case';

describe('ListarRoutingUseCase', () => {
  it('retorna todas las asociaciones del tenant (delegación directa al repo)', async () => {
    const asociaciones = [{ usuarioId: 'u1', tipoTicketId: 't1' }];
    const repo = { findAll: vi.fn().mockResolvedValue(asociaciones) };

    const useCase = new ListarRoutingUseCase(repo);
    const result = await useCase.execute();

    expect(result).toBe(asociaciones);
    expect(repo.findAll).toHaveBeenCalledTimes(1);
  });
});
