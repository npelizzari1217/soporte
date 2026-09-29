import { describe, it, expect, vi } from 'vitest';
import { CrearFeriadoClienteUseCase } from './crear-feriado-cliente.use-case';
import {
  FechaCalendarioInvalidaError,
  FeriadoFechaDuplicadaError,
  FeriadoFechaEsGlobalError,
} from '../../domain/errors/feriados.errors';

describe('CrearFeriadoClienteUseCase', () => {
  function makeDeps(esGlobal = false) {
    const feriadoRepo = { crear: vi.fn().mockResolvedValue(undefined) };
    const feriadosGlobalesChecker = { esGlobal: vi.fn().mockResolvedValue(esGlobal) };
    return { feriadoRepo, feriadosGlobalesChecker };
  }

  it('crea el feriado cuando la fecha es válida y no es global', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps(false);
    const useCase = new CrearFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({ fecha: '2026-11-20', descripcion: 'Feriado propio' });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().fecha.aClave()).toBe('2026-11-20');
    expect(result.getValue().descripcion).toBe('Feriado propio');
    expect(feriadosGlobalesChecker.esGlobal).toHaveBeenCalledTimes(1);
    expect(feriadoRepo.crear).toHaveBeenCalledTimes(1);
  });

  it('falla con FechaCalendarioInvalidaError sin consultar al checker ni al repositorio (2026-02-30 no existe)', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps();
    const useCase = new CrearFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({ fecha: '2026-02-30', descripcion: 'Inválida' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FechaCalendarioInvalidaError);
    expect(feriadosGlobalesChecker.esGlobal).not.toHaveBeenCalled();
    expect(feriadoRepo.crear).not.toHaveBeenCalled();
  });

  it('falla con FeriadoFechaEsGlobalError cuando la fecha ya es un feriado global, sin llamar al repositorio (D4)', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps(true);
    const useCase = new CrearFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({ fecha: '2026-12-25', descripcion: 'Navidad propia' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoFechaEsGlobalError);
    expect(result.getError().code).toBe('FERIADO_FECHA_ES_GLOBAL');
    expect(feriadoRepo.crear).not.toHaveBeenCalled();
  });

  it('mapea P2002 a FeriadoFechaDuplicadaError (duplicado dentro del propio listado de cliente)', async () => {
    const feriadoRepo = { crear: vi.fn().mockRejectedValue({ code: 'P2002' }) };
    const feriadosGlobalesChecker = { esGlobal: vi.fn().mockResolvedValue(false) };
    const useCase = new CrearFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({ fecha: '2026-11-20', descripcion: 'Feriado propio' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoFechaDuplicadaError);
    expect(result.getError().code).toBe('FERIADO_FECHA_DUPLICADA');
  });

  it('relanza cualquier otro error de infraestructura sin mapearlo', async () => {
    const otroError = new Error('conexión perdida');
    const feriadoRepo = { crear: vi.fn().mockRejectedValue(otroError) };
    const feriadosGlobalesChecker = { esGlobal: vi.fn().mockResolvedValue(false) };
    const useCase = new CrearFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    await expect(
      useCase.execute({ fecha: '2026-11-20', descripcion: 'Feriado propio' }),
    ).rejects.toBe(otroError);
  });
});
