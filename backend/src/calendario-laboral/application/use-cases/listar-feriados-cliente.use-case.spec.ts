import { describe, it, expect, vi } from 'vitest';
import { ListarFeriadosClienteUseCase } from './listar-feriados-cliente.use-case';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';

function feriado(iso: string, descripcion: string): FeriadoEntity {
  return FeriadoEntity.crear({ fecha: FechaCalendario.crear(iso).getValue(), descripcion });
}

describe('ListarFeriadosClienteUseCase', () => {
  it('devuelve la lista ya ordenada por el repositorio', async () => {
    const feriados = [
      feriado('2026-01-01', 'Feriado propio 1'),
      feriado('2026-05-01', 'Feriado propio 2'),
    ];
    const feriadoRepo = { listar: vi.fn().mockResolvedValue(feriados) };
    const useCase = new ListarFeriadosClienteUseCase(feriadoRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toBe(feriados);
    expect(feriadoRepo.listar).toHaveBeenCalledTimes(1);
  });

  it('devuelve una lista vacía sin fallar', async () => {
    const feriadoRepo = { listar: vi.fn().mockResolvedValue([]) };
    const useCase = new ListarFeriadosClienteUseCase(feriadoRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });
});
