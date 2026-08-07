import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoUseCase } from './obtener-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

describe('ObtenerEquipoUseCase', () => {
  it('retorna el equipo + sus componentes activos (item 1 — G7)', async () => {
    const equipo = EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
    });
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findActiveByEquipoId: vi.fn().mockResolvedValue(['componente-a']) };
    const useCase = new ObtenerEquipoUseCase(equipoRepo as never, componenteRepo as never);

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo.id).toBe(equipo.id);
    expect(result.getValue().componentes).toEqual(['componente-a']);
    expect(componenteRepo.findActiveByEquipoId).toHaveBeenCalledWith(equipo.id);
  });

  it('falla con EquipoNoEncontradoError si no existe (sin consultar componentes)', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const componenteRepo = { findActiveByEquipoId: vi.fn() };
    const useCase = new ObtenerEquipoUseCase(equipoRepo as never, componenteRepo as never);

    const result = await useCase.execute({ equipoId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.findActiveByEquipoId).not.toHaveBeenCalled();
  });
});
