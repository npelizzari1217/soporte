import { describe, expect, it, vi } from 'vitest';
import { EditarSectorUseCase } from './editar-sector.use-case';
import { SectorEntity } from '../../domain/entities/sector.entity';
import {
  SectorNoEncontradoError,
  SectorCodigoDuplicadoError,
} from '../../domain/errors/sectores.errors';

describe('EditarSectorUseCase (WU-06)', () => {
  function buildRepo(sector: SectorEntity | null, colisionante: SectorEntity | null = null) {
    return {
      findById: vi.fn().mockResolvedValue(sector),
      findByCodigo: vi.fn().mockResolvedValue(colisionante),
      save: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('edita nombre sin tocar codigo', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(sector);
    const useCase = new EditarSectorUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', nombre: 'A renombrado' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('A renombrado');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('rechaza con SectorNoEncontradoError si el id no existe', async () => {
    const repo = buildRepo(null);
    const useCase = new EditarSectorUseCase(repo);

    const result = await useCase.execute({ id: 'inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SectorNoEncontradoError);
  });

  it('rechaza con SectorCodigoDuplicadoError si el nuevo codigo choca con OTRO sector', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const otro = SectorEntity.create({ codigo: 'B', nombre: 'B', activo: true }, 'id-2');
    const repo = buildRepo(sector, otro);
    const useCase = new EditarSectorUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'B' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(SectorCodigoDuplicadoError);
  });

  it('re-enviar el mismo codigo actual NO dispara revalidación de duplicado', async () => {
    const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = buildRepo(sector);
    const useCase = new EditarSectorUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', codigo: 'A', nombre: 'A editado' });

    expect(result.isOk()).toBe(true);
    expect(repo.findByCodigo).not.toHaveBeenCalled();
  });
});
