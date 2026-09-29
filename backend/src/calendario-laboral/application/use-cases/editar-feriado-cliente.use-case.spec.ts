import { describe, it, expect, vi } from 'vitest';
import { EditarFeriadoClienteUseCase } from './editar-feriado-cliente.use-case';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';
import {
  FechaCalendarioInvalidaError,
  FeriadoFechaDuplicadaError,
  FeriadoFechaEsGlobalError,
  FeriadoNoEncontradoError,
} from '../../domain/errors/feriados.errors';

describe('EditarFeriadoClienteUseCase', () => {
  function makeFeriado() {
    return FeriadoEntity.crear(
      { fecha: FechaCalendario.crear('2026-11-20').getValue(), descripcion: 'Feriado propio' },
      'feriado-cliente-1',
    );
  }

  function makeDeps(feriado: FeriadoEntity | null = makeFeriado(), esGlobal = false) {
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      editar: vi.fn().mockResolvedValue(undefined),
    };
    const feriadosGlobalesChecker = { esGlobal: vi.fn().mockResolvedValue(esGlobal) };
    return { feriadoRepo, feriadosGlobalesChecker };
  }

  it('edita fecha y descripción cuando el feriado existe, la fecha es válida y no es global', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps();
    const useCase = new EditarFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({
      feriadoId: 'feriado-cliente-1',
      fecha: '2026-11-27',
      descripcion: 'Feriado propio (reprogramado)',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().fecha.aClave()).toBe('2026-11-27');
    expect(result.getValue().descripcion).toBe('Feriado propio (reprogramado)');
    expect(feriadosGlobalesChecker.esGlobal).toHaveBeenCalledTimes(1);
    expect(feriadoRepo.editar).toHaveBeenCalledTimes(1);
    expect(feriadoRepo.editar).toHaveBeenCalledWith(result.getValue());
  });

  it('falla con FeriadoNoEncontradoError si el id no existe, sin consultar al checker ni llamar a editar()', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps(null);
    const useCase = new EditarFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({
      feriadoId: 'inexistente',
      fecha: '2026-11-27',
      descripcion: 'X',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoNoEncontradoError);
    expect(feriadosGlobalesChecker.esGlobal).not.toHaveBeenCalled();
    expect(feriadoRepo.editar).not.toHaveBeenCalled();
  });

  it('falla con FechaCalendarioInvalidaError sin consultar al checker ni llamar a editar() (2026-02-30 no existe)', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps();
    const useCase = new EditarFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({
      feriadoId: 'feriado-cliente-1',
      fecha: '2026-02-30',
      descripcion: 'Inválida',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FechaCalendarioInvalidaError);
    expect(feriadosGlobalesChecker.esGlobal).not.toHaveBeenCalled();
    expect(feriadoRepo.editar).not.toHaveBeenCalled();
  });

  it('falla con FeriadoFechaEsGlobalError cuando la nueva fecha ya es un feriado global, sin llamar a editar() (D4)', async () => {
    const { feriadoRepo, feriadosGlobalesChecker } = makeDeps(makeFeriado(), true);
    const useCase = new EditarFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({
      feriadoId: 'feriado-cliente-1',
      fecha: '2026-12-25',
      descripcion: 'Navidad propia',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoFechaEsGlobalError);
    expect(result.getError().code).toBe('FERIADO_FECHA_ES_GLOBAL');
    expect(feriadoRepo.editar).not.toHaveBeenCalled();
  });

  it('mapea P2002 a FeriadoFechaDuplicadaError (duplicado dentro del propio listado de cliente)', async () => {
    const feriado = makeFeriado();
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      editar: vi.fn().mockRejectedValue({ code: 'P2002' }),
    };
    const feriadosGlobalesChecker = { esGlobal: vi.fn().mockResolvedValue(false) };
    const useCase = new EditarFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    const result = await useCase.execute({
      feriadoId: 'feriado-cliente-1',
      fecha: '2026-12-08',
      descripcion: 'Duplicado',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoFechaDuplicadaError);
    expect(result.getError().code).toBe('FERIADO_FECHA_DUPLICADA');
  });

  it('relanza cualquier otro error de infraestructura sin mapearlo', async () => {
    const feriado = makeFeriado();
    const otroError = new Error('conexión perdida');
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      editar: vi.fn().mockRejectedValue(otroError),
    };
    const feriadosGlobalesChecker = { esGlobal: vi.fn().mockResolvedValue(false) };
    const useCase = new EditarFeriadoClienteUseCase(feriadoRepo, feriadosGlobalesChecker);

    await expect(
      useCase.execute({ feriadoId: 'feriado-cliente-1', fecha: '2026-12-08', descripcion: 'X' }),
    ).rejects.toBe(otroError);
  });
});
