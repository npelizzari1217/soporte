import { describe, it, expect, vi } from 'vitest';
import { EliminarEquipoUseCase } from './eliminar-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

describe('EliminarEquipoUseCase', () => {
  it('aplica soft delete si el equipo existe', async () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
    });
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo), delete: vi.fn() };
    const useCase = new EliminarEquipoUseCase(equipoRepo as never);

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.isOk()).toBe(true);
    expect(equipoRepo.delete).toHaveBeenCalledWith(equipo.id);
  });

  it('falla con EquipoNoEncontradoError si ya estaba eliminado', async () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
    });
    equipo.softDelete();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo), delete: vi.fn() };
    const useCase = new EliminarEquipoUseCase(equipoRepo as never);

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(equipoRepo.delete).not.toHaveBeenCalled();
  });
});
