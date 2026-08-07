/**
 * crear-ciclo-vigente.use-case.spec.ts — TDD RED→GREEN (T9.1, PR9).
 *
 * R20: ROOT crea un ciclo en el catálogo master; el CHECK `fechaFin >
 * fechaInicio` se enforcea en la entidad (defensa en profundidad del CHECK
 * de DB, T9.2) y se re-emite como `Result.fail` en el límite del use case.
 */
import { describe, expect, it, vi } from 'vitest';
import { CrearCicloVigenteUseCase } from './crear-ciclo-vigente.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteInvalidDatesError } from '../../domain/errors/clientes.errors';

function buildRepoMock(): ICicloVigenteRepository {
  return {
    findById: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('CrearCicloVigenteUseCase', () => {
  it('persiste el ciclo y retorna Result.ok cuando las fechas son válidas', async () => {
    const repo = buildRepoMock();
    const useCase = new CrearCicloVigenteUseCase(repo);

    const result = await useCase.execute({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
    });

    expect(result.isOk()).toBe(true);
    const ciclo = result.getValue();
    expect(ciclo.nombre).toBe('Ciclo 2026');
    expect(ciclo.activo).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('retorna Result.fail(CicloVigenteInvalidDatesError) sin persistir cuando fechaFin <= fechaInicio', async () => {
    const repo = buildRepoMock();
    const useCase = new CrearCicloVigenteUseCase(repo);

    const result = await useCase.execute({
      nombre: 'Ciclo inválido',
      fechaInicio: new Date('2026-12-31'),
      fechaFin: new Date('2026-01-01'),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteInvalidDatesError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
