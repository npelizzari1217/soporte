import { describe, it, expect, vi } from 'vitest';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { TipoComponenteEntity } from '../../domain/entities/tipo-componente.entity';
import {
  EquipoNoEncontradoError,
  TipoComponenteInactivoError,
} from '../../domain/errors/equipos.errors';

/**
 * T12.4 [U][RED] — AgregarComponenteUseCase: tipo inactivo →
 * TipoComponenteInactivoError; N del mismo tipo permitido.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2.
 */
describe('AgregarComponenteUseCase', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
    });
  }
  function makeTipo(activo: boolean) {
    return TipoComponenteEntity.reconstitute(
      { codigo: 'RAM', nombre: 'Memoria RAM', activo },
      'tipo-ram',
      new Date(),
      new Date(),
      null,
    );
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const tipoComponenteRepo = { findById: vi.fn() };
    const componenteRepo = { save: vi.fn() };
    const useCase = new AgregarComponenteUseCase(
      equipoRepo as never,
      tipoComponenteRepo as never,
      componenteRepo as never,
    );

    const result = await useCase.execute({
      equipoId: 'no-existe',
      tipoComponenteId: 'tipo-ram',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });

  it('falla con TipoComponenteInactivoError si el tipo está inactivo', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteRepo = { findById: vi.fn().mockResolvedValue(makeTipo(false)) };
    const componenteRepo = { save: vi.fn() };
    const useCase = new AgregarComponenteUseCase(
      equipoRepo as never,
      tipoComponenteRepo as never,
      componenteRepo as never,
    );

    const result = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteId: 'tipo-ram',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteInactivoError);
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('permite agregar N componentes del mismo tipo (sin restricción de unicidad)', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteRepo = { findById: vi.fn().mockResolvedValue(makeTipo(true)) };
    const componenteRepo = { save: vi.fn() };
    const useCase = new AgregarComponenteUseCase(
      equipoRepo as never,
      tipoComponenteRepo as never,
      componenteRepo as never,
    );

    const resultado1 = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteId: 'tipo-ram',
      descripcion: 'Slot 1',
      numeroSerie: null,
      capacidad: '8GB',
    });
    const resultado2 = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteId: 'tipo-ram',
      descripcion: 'Slot 2',
      numeroSerie: null,
      capacidad: '8GB',
    });

    expect(resultado1.isOk()).toBe(true);
    expect(resultado2.isOk()).toBe(true);
    expect(componenteRepo.save).toHaveBeenCalledTimes(2);
  });
});
