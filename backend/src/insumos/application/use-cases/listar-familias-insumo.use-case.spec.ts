import { describe, expect, it, vi } from 'vitest';
import { ListarFamiliasInsumoUseCase } from './listar-familias-insumo.use-case';
import { FamiliaInsumoEntity } from '../../domain/entities/familia-insumo.entity';

describe('ListarFamiliasInsumoUseCase', () => {
  it('retorna las familias activas del repo', async () => {
    const activas = [FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true })];
    const repo = { findAllActive: vi.fn().mockResolvedValue(activas) };
    const useCase = new ListarFamiliasInsumoUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });
});
