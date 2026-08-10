import { describe, it, expect, vi } from 'vitest';
import { ObtenerEquipoUseCase } from './obtener-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';

/**
 * PR4b (sdd/tipos-componente-master): `ObtenerEquipoUseCase` enriquece cada
 * componente con `{tipoNombre, tipoActivo}` resueltos en batch desde el
 * catálogo MASTER (`ITipoComponenteMasterChecker.resolver`, sin N+1).
 */
describe('ObtenerEquipoUseCase', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
    });
  }

  function makeComponente(equipoId: string, tipoComponenteCodigo: string) {
    return ComponenteEquipoEntity.create({
      equipoId,
      tipoComponenteCodigo,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
  }

  it('retorna el equipo + sus componentes activos enriquecidos con nombre/estado del catálogo MASTER (item 1 — G7)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'RAM');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findActiveByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const tipoComponenteMasterChecker = {
      resolver: vi
        .fn()
        .mockResolvedValue(new Map([['RAM', { nombre: 'Memoria RAM', activo: true }]])),
    };
    const useCase = new ObtenerEquipoUseCase(
      equipoRepo as never,
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().equipo.id).toBe(equipo.id);
    expect(tipoComponenteMasterChecker.resolver).toHaveBeenCalledWith(['RAM']);
    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: 'Memoria RAM', tipoActivo: true },
    ]);
  });

  it('componente con código sin match en MASTER → tipoNombre null, tipoActivo false (best-effort)', async () => {
    const equipo = makeEquipo();
    const componente = makeComponente(equipo.id, 'DESCONTINUADO');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findActiveByEquipoId: vi.fn().mockResolvedValue([componente]) };
    const tipoComponenteMasterChecker = { resolver: vi.fn().mockResolvedValue(new Map()) };
    const useCase = new ObtenerEquipoUseCase(
      equipoRepo as never,
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.getValue().componentes).toEqual([
      { componente, tipoNombre: null, tipoActivo: false },
    ]);
  });

  it('sin componentes → no consulta el catálogo MASTER (batch vacío)', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const componenteRepo = { findActiveByEquipoId: vi.fn().mockResolvedValue([]) };
    const tipoComponenteMasterChecker = { resolver: vi.fn().mockResolvedValue(new Map()) };
    const useCase = new ObtenerEquipoUseCase(
      equipoRepo as never,
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({ equipoId: equipo.id });
    expect(result.getValue().componentes).toEqual([]);
    expect(tipoComponenteMasterChecker.resolver).toHaveBeenCalledWith([]);
  });

  it('falla con EquipoNoEncontradoError si no existe (sin consultar componentes ni catálogo)', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const componenteRepo = { findActiveByEquipoId: vi.fn() };
    const tipoComponenteMasterChecker = { resolver: vi.fn() };
    const useCase = new ObtenerEquipoUseCase(
      equipoRepo as never,
      componenteRepo as never,
      tipoComponenteMasterChecker as never,
    );

    const result = await useCase.execute({ equipoId: 'no-existe' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
    expect(componenteRepo.findActiveByEquipoId).not.toHaveBeenCalled();
    expect(tipoComponenteMasterChecker.resolver).not.toHaveBeenCalled();
  });
});
