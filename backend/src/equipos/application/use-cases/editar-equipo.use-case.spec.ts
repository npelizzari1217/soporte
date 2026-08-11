import { describe, it, expect, vi } from 'vitest';
import { EditarEquipoUseCase } from './editar-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import {
  EquipoNoEncontradoError,
  NumeroSerieDuplicadoError,
} from '../../domain/errors/equipos.errors';

/**
 * T12.1 [U][RED] — EditarEquipoUseCase: numeroSerie duplicado →
 * NumeroSerieDuplicadoError; equipo inexistente → EquipoNoEncontradoError.
 * La ubicación es TEXTO LIBRE (no se valida) — el use case ya no inyecta
 * `ubicacionRepo`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('EditarEquipoUseCase', () => {
  function makeEquipo(
    overrides: Partial<Parameters<typeof EquipoInformaticoEntity.create>[0]> = {},
  ) {
    return EquipoInformaticoEntity.create({
      nombre: 'Original',
      numeroSerie: 'SN-ORIG',
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacion: null,
      importe: null,
      fechaValoracion: null,
      observaciones: null,
      valorResidual: null,
      fechaValorResidual: null,
      ...overrides,
    });
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new EditarEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({ equipoId: 'no-existe', nombre: 'X' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });

  it('edita nombre/marca (PATCH semántico) y persiste', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo), save: vi.fn() };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new EditarEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({ equipoId: equipo.id, nombre: 'Editado' });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().nombre).toBe('Editado');
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('falla con NumeroSerieDuplicadoError si el nuevo numeroSerie pertenece a OTRO equipo', async () => {
    const equipo = makeEquipo();
    const otroEquipoConEseSerie = makeEquipo({ numeroSerie: 'SN-OTRO' });
    const equipoRepo = {
      findById: vi.fn().mockResolvedValue(equipo),
      findByNumeroSerie: vi.fn().mockResolvedValue(otroEquipoConEseSerie),
      save: vi.fn(),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new EditarEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({ equipoId: equipo.id, numeroSerie: 'SN-OTRO' });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(NumeroSerieDuplicadoError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('permite mantener el mismo numeroSerie del propio equipo (no es duplicado consigo mismo)', async () => {
    const equipo = makeEquipo({ numeroSerie: 'SN-MISMO' });
    const equipoRepo = {
      findById: vi.fn().mockResolvedValue(equipo),
      findByNumeroSerie: vi.fn().mockResolvedValue(equipo),
      save: vi.fn(),
    };
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const useCase = new EditarEquipoUseCase(equipoRepo as never, txRunner as never);

    const result = await useCase.execute({ equipoId: equipo.id, numeroSerie: 'SN-MISMO' });
    expect(result.isOk()).toBe(true);
  });
});
