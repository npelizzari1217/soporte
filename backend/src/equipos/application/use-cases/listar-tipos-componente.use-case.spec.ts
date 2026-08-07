import { describe, it, expect, vi } from 'vitest';
import { ListarTiposComponenteUseCase } from './listar-tipos-componente.use-case';
import { TipoComponenteEntity } from '../../domain/entities/tipo-componente.entity';

describe('ListarTiposComponenteUseCase', () => {
  it('retorna los tipos de componente activos del catálogo', async () => {
    const tipo = TipoComponenteEntity.reconstitute(
      { codigo: 'RAM', nombre: 'Memoria RAM', activo: true },
      'tipo-ram',
      new Date(),
      new Date(),
      null,
    );
    const tipoComponenteRepo = { findAllActive: vi.fn().mockResolvedValue([tipo]) };
    const useCase = new ListarTiposComponenteUseCase(tipoComponenteRepo as never);

    const result = await useCase.execute();
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toHaveLength(1);
  });
});
