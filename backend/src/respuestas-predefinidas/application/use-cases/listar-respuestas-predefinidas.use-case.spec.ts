import { describe, expect, it, vi } from 'vitest';
import { ListarRespuestasPredefinidasUseCase } from './listar-respuestas-predefinidas.use-case';

describe('ListarRespuestasPredefinidasUseCase', () => {
  it.each([true, false])('delega en findAll con soloActivas=%s', async (soloActivas) => {
    const repo = { findAll: vi.fn().mockResolvedValue([]) };

    await new ListarRespuestasPredefinidasUseCase(repo).execute(soloActivas);

    expect(repo.findAll).toHaveBeenCalledWith(soloActivas);
  });
});
