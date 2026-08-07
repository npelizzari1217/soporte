import { describe, it, expect, vi } from 'vitest';
import { CrearEquipoUseCase } from './crear-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { UbicacionEntity } from '../../../reparaciones/domain/entities/ubicacion.entity';
import { NumeroSerieDuplicadoError } from '../../domain/errors/equipos.errors';
import { UbicacionInvalidaError } from '../../../reparaciones/domain/errors/reparaciones.errors';

/**
 * T12.1 [U][RED] — CrearEquipoUseCase: numeroSerie duplicado →
 * NumeroSerieDuplicadoError; ubicacionId validado.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('CrearEquipoUseCase', () => {
  function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
    const equipoRepo = {
      findByNumeroSerie: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const ubicacionRepo = {
      findById: vi.fn().mockResolvedValue(null),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    return { equipoRepo, ubicacionRepo, txRunner, ...overrides };
  }

  it('crea el equipo cuando numeroSerie/ubicacionId son válidos (o ausentes)', async () => {
    const { equipoRepo, ubicacionRepo, txRunner } = makeDeps();
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      ubicacionRepo as never,
      txRunner as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook A',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
    });

    expect(result.isOk()).toBe(true);
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('falla con NumeroSerieDuplicadoError si ya existe otro equipo con el mismo numeroSerie', async () => {
    const equipoExistente = EquipoInformaticoEntity.create({
      nombre: 'Ya existe',
      numeroSerie: 'SN-DUP',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
    });
    const { equipoRepo, ubicacionRepo, txRunner } = makeDeps({
      equipoRepo: {
        findByNumeroSerie: vi.fn().mockResolvedValue(equipoExistente),
        save: vi.fn(),
      },
    });
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      ubicacionRepo as never,
      txRunner as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook B',
      numeroSerie: 'SN-DUP',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('falla con UbicacionInvalidaError si ubicacionId no existe', async () => {
    const { equipoRepo, ubicacionRepo, txRunner } = makeDeps();
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      ubicacionRepo as never,
      txRunner as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook C',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: 'ubicacion-inexistente',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UbicacionInvalidaError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('crea el equipo cuando ubicacionId existe y no está eliminada', async () => {
    const ubicacion = UbicacionEntity.create({ nombre: 'Piso 3' });
    const { equipoRepo, ubicacionRepo, txRunner } = makeDeps({
      ubicacionRepo: { findById: vi.fn().mockResolvedValue(ubicacion) },
    });
    const useCase = new CrearEquipoUseCase(
      equipoRepo as never,
      ubicacionRepo as never,
      txRunner as never,
    );

    const result = await useCase.execute({
      nombre: 'Notebook D',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: ubicacion.id,
    });

    expect(result.isOk()).toBe(true);
  });
});
