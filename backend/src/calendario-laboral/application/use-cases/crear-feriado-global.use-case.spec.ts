import { describe, it, expect, vi } from 'vitest';
import { CrearFeriadoGlobalUseCase } from './crear-feriado-global.use-case';
import {
  FechaCalendarioInvalidaError,
  FeriadoFechaDuplicadaError,
} from '../../domain/errors/feriados.errors';

describe('CrearFeriadoGlobalUseCase', () => {
  function makeDeps() {
    const feriadoRepo = { crear: vi.fn().mockResolvedValue(undefined) };
    return { feriadoRepo };
  }

  it('crea el feriado cuando la fecha es válida', async () => {
    const { feriadoRepo } = makeDeps();
    const useCase = new CrearFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({ fecha: '2026-12-25', descripcion: 'Navidad' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().fecha.aClave()).toBe('2026-12-25');
    expect(result.getValue().descripcion).toBe('Navidad');
    expect(feriadoRepo.crear).toHaveBeenCalledTimes(1);
  });

  it('falla con FechaCalendarioInvalidaError sin llamar al repositorio (2026-02-30 no existe)', async () => {
    const { feriadoRepo } = makeDeps();
    const useCase = new CrearFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({ fecha: '2026-02-30', descripcion: 'Inválida' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FechaCalendarioInvalidaError);
    expect(feriadoRepo.crear).not.toHaveBeenCalled();
  });

  it('mapea P2002 a FeriadoFechaDuplicadaError (carrera concurrente sobre fecha UNIQUE)', async () => {
    const feriadoRepo = {
      crear: vi.fn().mockRejectedValue({ code: 'P2002' }),
    };
    const useCase = new CrearFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({ fecha: '2026-01-01', descripcion: 'Año Nuevo' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoFechaDuplicadaError);
    expect(result.getError().code).toBe('FERIADO_FECHA_DUPLICADA');
  });

  it('relanza cualquier otro error de infraestructura sin mapearlo', async () => {
    const otroError = new Error('conexión perdida');
    const feriadoRepo = { crear: vi.fn().mockRejectedValue(otroError) };
    const useCase = new CrearFeriadoGlobalUseCase(feriadoRepo);

    await expect(useCase.execute({ fecha: '2026-01-01', descripcion: 'Año Nuevo' })).rejects.toBe(
      otroError,
    );
  });
});
