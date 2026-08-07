import { describe, it, expect, vi } from 'vitest';
import { ListarPrioridadesUseCase } from './listar-prioridades.use-case';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';

describe('ListarPrioridadesUseCase', () => {
  it('retorna las prioridades activas del catálogo, ordenadas por el repo (G1, sdd/beta-frontend)', async () => {
    const prioridad = PrioridadEntity.reconstitute(
      { codigo: 'ALTA', nombre: 'Alta', color: '#ff0000', orden: 1, activo: true },
      'prioridad-1',
      new Date(),
      new Date(),
      null,
    );
    const prioridadRepo = { findAllActive: vi.fn().mockResolvedValue([prioridad]) };
    const useCase = new ListarPrioridadesUseCase(prioridadRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([prioridad]);
    expect(prioridadRepo.findAllActive).toHaveBeenCalledOnce();
  });
});
