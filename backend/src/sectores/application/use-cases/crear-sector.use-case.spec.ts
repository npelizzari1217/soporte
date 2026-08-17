import { describe, expect, it, vi } from 'vitest';
import { CrearSectorUseCase } from './crear-sector.use-case';
import { ISectorRepository } from '../../domain/ports/i-sector.repository';
import { SectorCodigoDuplicadoError } from '../../domain/errors/sectores.errors';
import { SectorEntity } from '../../domain/entities/sector.entity';

describe('CrearSectorUseCase (WU-06)', () => {
  function buildRepo(overrides: Partial<Pick<ISectorRepository, 'findByCodigo' | 'save'>> = {}) {
    return {
      findByCodigo: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('crea el sector cuando el codigo no está en uso', async () => {
    const repo = buildRepo();
    const useCase = new CrearSectorUseCase(repo);

    const result = await useCase.execute({ codigo: 'COMPUTACION', nombre: 'Computación' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().codigo).toBe('COMPUTACION');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza con SectorCodigoDuplicadoError si el codigo ya existe (activo o soft-deleted)', async () => {
    const existente = SectorEntity.create({ codigo: 'COMPUTACION', nombre: 'X', activo: false });
    const repo = buildRepo({ findByCodigo: vi.fn().mockResolvedValue(existente) });
    const useCase = new CrearSectorUseCase(repo);

    const result = await useCase.execute({ codigo: 'COMPUTACION', nombre: 'Computación' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SectorCodigoDuplicadoError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
