import { describe, expect, it, vi } from 'vitest';
import { ListarUnidadesMedidaUseCase } from './listar-unidades-medida.use-case';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';

describe('ListarUnidadesMedidaUseCase', () => {
  it('retorna las unidades activas del repo', async () => {
    const activas = [UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true })];
    const repo = { findAllActive: vi.fn().mockResolvedValue(activas) };
    const useCase = new ListarUnidadesMedidaUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });
});
