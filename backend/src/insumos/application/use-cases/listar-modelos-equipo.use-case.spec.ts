import { describe, expect, it, vi } from 'vitest';
import { ListarModelosEquipoUseCase } from './listar-modelos-equipo.use-case';
import { ModeloEquipoEntity } from '../../domain/entities/modelo-equipo.entity';

describe('ListarModelosEquipoUseCase', () => {
  it('retorna los modelos activos del repo', async () => {
    const activos = [ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true })];
    const repo = { findAllActive: vi.fn().mockResolvedValue(activos) };
    const useCase = new ListarModelosEquipoUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]!.marca).toBe('HP');
  });
});
