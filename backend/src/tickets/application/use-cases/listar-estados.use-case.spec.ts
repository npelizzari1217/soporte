import { describe, it, expect, vi } from 'vitest';
import { ListarEstadosUseCase } from './listar-estados.use-case';
import { EstadoEntity } from '../../domain/entities/estado.entity';

describe('ListarEstadosUseCase', () => {
  it('retorna los estados activos del catálogo FIJO (G1, sdd/beta-frontend)', async () => {
    const estado = EstadoEntity.reconstitute(
      { codigo: 'NUEVO', nombre: 'Nuevo', color: '#00ff00', orden: 1, activo: true },
      'estado-1',
      new Date(),
      new Date(),
      null,
    );
    const estadoRepo = { findAllActive: vi.fn().mockResolvedValue([estado]) };
    const useCase = new ListarEstadosUseCase(estadoRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([estado]);
    expect(estadoRepo.findAllActive).toHaveBeenCalledOnce();
  });
});
