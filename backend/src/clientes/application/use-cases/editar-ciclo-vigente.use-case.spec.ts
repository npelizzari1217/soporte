/**
 * editar-ciclo-vigente.use-case.spec.ts — TDD RED→GREEN (sdd/ciclos-abm-root).
 *
 * ROOT edita nombre/fechas de un ciclo del catálogo master. Reutiliza el
 * invariante estructural `fechaFin > fechaInicio` (R20) ya enforced en
 * `CicloVigenteEntity.reschedule()`.
 */
import { describe, expect, it, vi } from 'vitest';
import { EditarCicloVigenteUseCase } from './editar-ciclo-vigente.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import {
  CicloVigenteInvalidDatesError,
  CicloVigenteNotFoundError,
} from '../../domain/errors/clientes.errors';

function buildRepoMock(): Pick<ICicloVigenteRepository, 'findById' | 'save'> {
  return {
    findById: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function buildCiclo(): CicloVigenteEntity {
  return CicloVigenteEntity.create({
    nombre: 'Ciclo 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: true,
  });
}

describe('EditarCicloVigenteUseCase', () => {
  it('edita nombre y fechas y persiste el ciclo', async () => {
    const repo = buildRepoMock();
    const ciclo = buildCiclo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ciclo);
    const useCase = new EditarCicloVigenteUseCase(repo);

    const result = await useCase.execute({
      cicloVigenteId: ciclo.id,
      nombre: 'Ciclo 2026 renombrado',
      fechaInicio: new Date('2026-02-01'),
      fechaFin: new Date('2026-11-30'),
    });

    expect(result.isOk()).toBe(true);
    const editado = result.getValue();
    expect(editado.nombre).toBe('Ciclo 2026 renombrado');
    expect(editado.fechaInicio).toEqual(new Date('2026-02-01'));
    expect(editado.fechaFin).toEqual(new Date('2026-11-30'));
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('edita solo el nombre sin tocar las fechas cuando no se envían', async () => {
    const repo = buildRepoMock();
    const ciclo = buildCiclo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ciclo);
    const useCase = new EditarCicloVigenteUseCase(repo);

    const result = await useCase.execute({ cicloVigenteId: ciclo.id, nombre: 'Solo nombre' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Solo nombre');
    expect(result.getValue().fechaInicio).toEqual(new Date('2026-01-01'));
    expect(result.getValue().fechaFin).toEqual(new Date('2026-12-31'));
  });

  it('retorna Result.fail(CicloVigenteInvalidDatesError) sin persistir cuando fechaFin <= fechaInicio', async () => {
    const repo = buildRepoMock();
    const ciclo = buildCiclo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ciclo);
    const useCase = new EditarCicloVigenteUseCase(repo);

    const result = await useCase.execute({
      cicloVigenteId: ciclo.id,
      fechaInicio: new Date('2026-12-31'),
      fechaFin: new Date('2026-01-01'),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteInvalidDatesError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('retorna Result.fail(CicloVigenteNotFoundError) cuando el ciclo no existe', async () => {
    const repo = buildRepoMock();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new EditarCicloVigenteUseCase(repo);

    const result = await useCase.execute({ cicloVigenteId: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('retorna Result.fail(CicloVigenteNotFoundError) cuando el ciclo ya está soft-deleted', async () => {
    const repo = buildRepoMock();
    const ciclo = buildCiclo();
    ciclo.softDelete();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ciclo);
    const useCase = new EditarCicloVigenteUseCase(repo);

    const result = await useCase.execute({ cicloVigenteId: ciclo.id, nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
  });
});
