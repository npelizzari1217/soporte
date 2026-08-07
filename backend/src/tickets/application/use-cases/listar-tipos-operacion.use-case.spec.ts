import { describe, it, expect, vi } from 'vitest';
import { ListarTiposOperacionUseCase } from './listar-tipos-operacion.use-case';
import { TipoOperacionEntity } from '../../domain/entities/tipo-operacion.entity';

describe('ListarTiposOperacionUseCase', () => {
  it('retorna los tipos de operación activos del catálogo FIJO (sdd/beta-frontend)', async () => {
    const tipo = TipoOperacionEntity.reconstitute(
      { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado', activo: true },
      'tipo-op-1',
      new Date(),
      new Date(),
      null,
    );
    const tipoOperacionRepo = { findAllActive: vi.fn().mockResolvedValue([tipo]) };
    const useCase = new ListarTiposOperacionUseCase(tipoOperacionRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([tipo]);
    expect(tipoOperacionRepo.findAllActive).toHaveBeenCalledOnce();
  });
});
