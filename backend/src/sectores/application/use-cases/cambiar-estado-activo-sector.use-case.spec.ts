import { describe, expect, it, vi } from 'vitest';
import { CambiarEstadoActivoSectorUseCase } from './cambiar-estado-activo-sector.use-case';
import { SectorEntity } from '../../domain/entities/sector.entity';
import { SectorNoEncontradoError } from '../../domain/errors/sectores.errors';

describe('CambiarEstadoActivoSectorUseCase (WU-06)', () => {
  it('desactiva un sector activo', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = {
      findById: vi.fn().mockResolvedValue(sector),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoSectorUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
  });

  it('reactiva un sector desactivado (caso hermano)', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    sector.desactivar();
    const repo = {
      findById: vi.fn().mockResolvedValue(sector),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoSectorUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
  });

  it('rechaza con SectorNoEncontradoError si el id no existe', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new CambiarEstadoActivoSectorUseCase(repo);

    const result = await useCase.execute({ id: 'nope', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SectorNoEncontradoError);
  });
});
