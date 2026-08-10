/**
 * activar-tipo-componente.use-case.spec.ts — TDD RED→GREEN (sdd/tipos-componente-master, PR2).
 */
import { describe, expect, it, vi } from 'vitest';
import { ActivarTipoComponenteUseCase } from './activar-tipo-componente.use-case';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { TipoComponenteNotFoundError } from '../../domain/errors/tipos-componente.errors';

function buildRepoMock(): Pick<ITipoComponenteMasterRepository, 'findById' | 'save'> {
  return {
    findById: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function buildTipoInactivo(): TipoComponente {
  const tipo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
  tipo.desactivar();
  return tipo;
}

describe('ActivarTipoComponenteUseCase', () => {
  it('reactiva el tipo de componente y lo persiste', async () => {
    const repo = buildRepoMock();
    const tipo = buildTipoInactivo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(tipo);
    const useCase = new ActivarTipoComponenteUseCase(repo);

    const result = await useCase.execute({ id: tipo.id });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(tipo);
  });

  it('retorna Result.fail(TipoComponenteNotFoundError) sin persistir cuando no existe', async () => {
    const repo = buildRepoMock();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new ActivarTipoComponenteUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
