import { describe, it, expect, vi } from 'vitest';
import { EliminarFeriadoClienteUseCase } from './eliminar-feriado-cliente.use-case';
import { FeriadoEntity } from '../../domain/entities/feriado.entity';
import { FechaCalendario } from '../../domain/value-objects/fecha-calendario';
import { FeriadoNoEncontradoError } from '../../domain/errors/feriados.errors';

describe('EliminarFeriadoClienteUseCase', () => {
  it('elimina físicamente el feriado cuando existe', async () => {
    const feriado = FeriadoEntity.crear(
      { fecha: FechaCalendario.crear('2026-01-01').getValue(), descripcion: 'Feriado propio' },
      'feriado-cliente-1',
    );
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(feriado),
      eliminar: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new EliminarFeriadoClienteUseCase(feriadoRepo);

    const result = await useCase.execute({ feriadoId: 'feriado-cliente-1' });

    expect(result.isOk()).toBe(true);
    expect(feriadoRepo.eliminar).toHaveBeenCalledWith('feriado-cliente-1');
  });

  it('falla con FeriadoNoEncontradoError si el id no existe, sin llamar a eliminar()', async () => {
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(null),
      eliminar: vi.fn(),
    };
    const useCase = new EliminarFeriadoClienteUseCase(feriadoRepo);

    const result = await useCase.execute({ feriadoId: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoNoEncontradoError);
    expect(feriadoRepo.eliminar).not.toHaveBeenCalled();
  });

  it('el id no encontrado nunca resuelve una fila de otro tenant — la aislación es estructural (D6)', async () => {
    // El repositorio real (PrismaFeriadoClienteRepository, WU3a) resuelve
    // siempre sobre la DB del tenant ligado por TenantContext; buscarPorId
    // devolviendo null para un id ajeno es exactamente el comportamiento que
    // esta prueba fija a nivel de use case (D6, isolation.md).
    const feriadoRepo = {
      buscarPorId: vi.fn().mockResolvedValue(null),
      eliminar: vi.fn(),
    };
    const useCase = new EliminarFeriadoClienteUseCase(feriadoRepo);

    const result = await useCase.execute({ feriadoId: 'id-de-otro-tenant' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(FeriadoNoEncontradoError);
  });
});
