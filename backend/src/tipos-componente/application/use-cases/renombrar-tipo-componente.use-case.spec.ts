/**
 * renombrar-tipo-componente.use-case.spec.ts — TDD RED→GREEN (sdd/tipos-componente-master, PR2).
 *
 * ROOT renombra un tipo de componente del catálogo MASTER. El `codigo` es
 * inmutable — este use case SOLO toca `nombre`.
 */
import { describe, expect, it, vi } from 'vitest';
import { RenombrarTipoComponenteUseCase } from './renombrar-tipo-componente.use-case';
import { ITipoComponenteMasterRepository } from '../../domain/ports/i-tipo-componente-master.repository';
import { TipoComponente } from '../../domain/entities/tipo-componente.entity';
import { TipoComponenteNotFoundError } from '../../domain/errors/tipos-componente.errors';

function buildRepoMock(): Pick<ITipoComponenteMasterRepository, 'findById' | 'save'> {
  return {
    findById: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RenombrarTipoComponenteUseCase', () => {
  it('renombra el tipo de componente y lo persiste, sin tocar el código', async () => {
    const repo = buildRepoMock();
    const tipo = TipoComponente.create({ codigo: 'CPU', nombre: 'Procesador' }).getValue();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(tipo);
    const useCase = new RenombrarTipoComponenteUseCase(repo);

    const result = await useCase.execute({ id: tipo.id, nombre: 'Unidad de procesamiento' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Unidad de procesamiento');
    expect(result.getValue().codigo).toBe('CPU');
    expect(repo.save).toHaveBeenCalledWith(tipo);
  });

  it('retorna Result.fail(TipoComponenteNotFoundError) sin persistir cuando no existe', async () => {
    const repo = buildRepoMock();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new RenombrarTipoComponenteUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
