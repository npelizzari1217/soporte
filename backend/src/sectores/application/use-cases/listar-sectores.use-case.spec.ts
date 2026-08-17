import { describe, expect, it, vi } from 'vitest';
import { ListarSectoresUseCase } from './listar-sectores.use-case';
import { SectorEntity } from '../../domain/entities/sector.entity';

describe('ListarSectoresUseCase (WU-06)', () => {
  it('retorna los sectores activos del repo', async () => {
    const activos = [SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true })];
    const repo = { findAllActive: vi.fn().mockResolvedValue(activos) };
    const useCase = new ListarSectoresUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0]!.codigo).toBe('A');
  });
});
