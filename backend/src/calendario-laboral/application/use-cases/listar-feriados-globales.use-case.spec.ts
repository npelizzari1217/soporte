import { describe, it, expect, vi } from 'vitest';
import { ListarFeriadosGlobalesUseCase } from './listar-feriados-globales.use-case';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';

function feriado(iso: string, descripcion: string): FeriadoEntity {
  return FeriadoEntity.crear({ fecha: FechaCalendario.crear(iso).getValue(), descripcion });
}

describe('ListarFeriadosGlobalesUseCase', () => {
  it('devuelve la lista ya ordenada por el repositorio', async () => {
    const feriados = [
      feriado('2026-01-01', 'Año Nuevo'),
      feriado('2026-05-01', 'Día del Trabajador'),
    ];
    const feriadoRepo = { listar: vi.fn().mockResolvedValue(feriados) };
    const useCase = new ListarFeriadosGlobalesUseCase(feriadoRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(feriados);
    expect(feriadoRepo.listar).toHaveBeenCalledTimes(1);
  });

  it('devuelve una lista vacía sin fallar', async () => {
    const feriadoRepo = { listar: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarFeriadosGlobalesUseCase(feriadoRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });
});
