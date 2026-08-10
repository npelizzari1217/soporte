import { describe, it, expect, vi } from 'vitest';
import { AgregarComponenteUseCase } from './agregar-componente.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import {
  EquipoNoEncontradoError,
  TipoComponenteInactivoError,
} from '../../domain/errors/equipos.errors';

/**
 * T12.4 [U][RED] — AgregarComponenteUseCase: tipo inactivo/inexistente →
 * TipoComponenteInactivoError; N del mismo tipo permitido.
 *
 * PR4b (sdd/tipos-componente-master): la verificación de "tipo activo" pasa
 * de `ITipoComponenteRepository` (catálogo tenant, eliminado) a
 * `ITipoComponenteMasterChecker.estaActivo(codigo)` (catálogo MASTER cross-DB).
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
    });
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn() };
    const componenteRepo = { save: vi.fn() };
    const useCase = new AgregarComponenteUseCase(
      equipoRepo as never,
      tipoComponenteMasterChecker as never,
      componenteRepo as never,
    );

    const result = await useCase.execute({
      equipoId: 'no-existe',
      tipoComponenteCodigo: 'RAM',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });

  it('falla con TipoComponenteInactivoError si el tipo está inactivo (o no existe) en MASTER', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(false) };
    const componenteRepo = { save: vi.fn() };
    const useCase = new AgregarComponenteUseCase(
      equipoRepo as never,
      tipoComponenteMasterChecker as never,
      componenteRepo as never,
    );

    const result = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteCodigo: 'RAM',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TipoComponenteInactivoError);
    expect(tipoComponenteMasterChecker.estaActivo).toHaveBeenCalledWith('RAM');
    expect(componenteRepo.save).not.toHaveBeenCalled();
  });

  it('permite agregar N componentes del mismo tipo (sin restricción de unicidad)', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo) };
    const tipoComponenteMasterChecker = { estaActivo: vi.fn().mockResolvedValue(true) };
    const componenteRepo = { save: vi.fn() };
    const useCase = new AgregarComponenteUseCase(
      equipoRepo as never,
      tipoComponenteMasterChecker as never,
      componenteRepo as never,
    );

    const resultado1 = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteCodigo: 'RAM',
      descripcion: 'Slot 1',
      numeroSerie: null,
      capacidad: '8GB',
    });
    const resultado2 = await useCase.execute({
      equipoId: equipo.id,
      tipoComponenteCodigo: 'RAM',
      descripcion: 'Slot 2',
      numeroSerie: null,
      capacidad: '8GB',
    });

    expect(resultado1.isOk()).toBe(true);
    expect(resultado2.isOk()).toBe(true);
    expect(componenteRepo.save).toHaveBeenCalledTimes(2);
  });
});
