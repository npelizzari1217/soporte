import { describe, it, expect, vi } from 'vitest';
import { EditarFeriadoGlobalUseCase } from './editar-feriado-global.use-case';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';
import {
  FechaCalendarioInvalidaError,
  FeriadoFechaDuplicadaError,
  FeriadoNoEncontradoError,
} from '../../domain/errors/feriados.errors';

describe('EditarFeriadoGlobalUseCase', () => {
  function makeFeriado() {
    return FeriadoEntity.crear(
      { fecha: FechaCalendario.crear('2026-01-01').getValue(), descripcion: 'Año Nuevo' },
      'feriado-1',
    );
  }

  function makeDeps(feriado: FeriadoEntity | null = makeFeriado()) {
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      editar: vi.fn().mockResolvedValue(undefined),
    };
    return { feriadoRepo };
  }

  it('edita fecha y descripción cuando el feriado existe y la fecha es válida', async () => {
    const { feriadoRepo } = makeDeps();
    const useCase = new EditarFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({
      feriadoId: 'feriado-1',
      fecha: '2026-12-25',
      descripcion: 'Navidad',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().fecha.aClave()).toBe('2026-12-25');
    expect(result.getValue().descripcion).toBe('Navidad');
    expect(feriadoRepo.editar).toHaveBeenCalledTimes(1);
    expect(feriadoRepo.editar).toHaveBeenCalledWith(result.getValue());
  });

  it('falla con FeriadoNoEncontradoError si el id no existe, sin llamar a editar()', async () => {
    const { feriadoRepo } = makeDeps(null);
    const useCase = new EditarFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({
      feriadoId: 'inexistente',
      fecha: '2026-12-25',
      descripcion: 'Navidad',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoNoEncontradoError);
    expect(feriadoRepo.editar).not.toHaveBeenCalled();
  });

  it('falla con FechaCalendarioInvalidaError sin llamar a editar() (2026-02-30 no existe)', async () => {
    const { feriadoRepo } = makeDeps();
    const useCase = new EditarFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({
      feriadoId: 'feriado-1',
      fecha: '2026-02-30',
      descripcion: 'Inválida',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FechaCalendarioInvalidaError);
    expect(feriadoRepo.editar).not.toHaveBeenCalled();
  });

  it('mapea P2002 a FeriadoFechaDuplicadaError (carrera concurrente sobre fecha UNIQUE)', async () => {
    const feriado = makeFeriado();
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      editar: vi.fn().mockRejectedValue({ code: 'P2002' }),
    };
    const useCase = new EditarFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({
      feriadoId: 'feriado-1',
      fecha: '2026-05-01',
      descripcion: 'Día del Trabajador',
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
    const useCase = new EditarFeriadoGlobalUseCase(feriadoRepo);

    await expect(
      useCase.execute({ feriadoId: 'feriado-1', fecha: '2026-05-01', descripcion: 'X' }),
    ).rejects.toBe(otroError);
  });
});
