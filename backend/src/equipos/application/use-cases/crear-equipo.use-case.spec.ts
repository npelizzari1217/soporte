import { describe, it, expect, vi } from 'vitest';
import { CrearEquipoUseCase } from './crear-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { NumeroSerieDuplicadoError } from '../../domain/errors/equipos.errors';

/**
 * T12.1 [U][RED] — CrearEquipoUseCase: numeroSerie duplicado →
 * NumeroSerieDuplicadoError. La ubicación pasó de FK (catálogo) a TEXTO LIBRE
 * — ya no se valida contra el catálogo, por eso el use case ya no inyecta
 * `ubicacionRepo` ni produce `UbicacionInvalidaError`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('CrearEquipoUseCase', () => {
  function makeDeps(overrides: Partial<Record<string, unknown>> = {}) {
    const equipoRepo = {
      findByNumeroSerie: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    return { equipoRepo, txRunner, ...overrides };
  }

  it('crea el equipo cuando numeroSerie es válido (o ausente)', async () => {
    const { equipoRepo, txRunner } = makeDeps();
    const useCase = new CrearEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({
      nombre: 'Notebook A',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
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
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
    });
    const { equipoRepo, txRunner } = makeDeps({
      equipoRepo: {
        findByNumeroSerie: vi.fn().mockResolvedValue(equipoExistente),
        save: vi.fn(),
      },
    });
    const useCase = new CrearEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({
      nombre: 'Notebook B',
      numeroSerie: 'SN-DUP',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('crea el equipo (ubicacion es texto libre, no se valida)', async () => {
    const { equipoRepo, txRunner } = makeDeps();
    const useCase = new CrearEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({
      nombre: 'Notebook D',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: 'Piso 3',
    });

    expect(result.isOk()).toBe(true);
    // texto libre normalizado a mayúscula por la entidad, sin lookup de catálogo.
    expect(result.getValue().ubicacion).toBe('PISO 3');
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });
});
