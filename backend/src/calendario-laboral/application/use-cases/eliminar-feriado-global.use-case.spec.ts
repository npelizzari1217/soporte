import { describe, it, expect, vi } from 'vitest';
import { EliminarFeriadoGlobalUseCase } from './eliminar-feriado-global.use-case';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';
import { FeriadoNoEncontradoError } from '../../domain/errors/feriados.errors';

describe('EliminarFeriadoGlobalUseCase', () => {
  it('elimina físicamente el feriado cuando existe', async () => {
    const feriado = FeriadoEntity.crear(
      { fecha: FechaCalendario.crear('2026-01-01').getValue(), descripcion: 'Año Nuevo' },
      'feriado-1',
    );
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      eliminar: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new EliminarFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({ feriadoId: 'feriado-1' });

    expect(result.isOk()).toBe(true);
    expect(feriadoRepo.eliminar).toHaveBeenCalledWith('feriado-1');
  });

  it('falla con FeriadoNoEncontradoError si el id no existe, sin llamar a eliminar()', async () => {
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(null),
      eliminar: vi.fn(),
    };
    const useCase = new EliminarFeriadoGlobalUseCase(feriadoRepo);

    const result = await useCase.execute({ feriadoId: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoNoEncontradoError);
    expect(feriadoRepo.eliminar).not.toHaveBeenCalled();
  });
});
