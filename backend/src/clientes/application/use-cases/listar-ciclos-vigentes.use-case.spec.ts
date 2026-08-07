/**
 * [UNIT] RED→GREEN: `ListarCiclosVigentesUseCase` (sdd/beta-frontend item 4 — G6).
 */
import { ListarCiclosVigentesUseCase } from './listar-ciclos-vigentes.use-case';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';

describe('ListarCiclosVigentesUseCase', () => {
  it('retorna los ciclos activos del catálogo global (delegación directa al repo)', async () => {
    const ciclos = [
      CicloVigenteEntity.create(
        {
          nombre: '2026',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: true,
        },
        'c1',
      ),
    ];
    const repo = { findAllActivos: vi.fn().mockResolvedValue(ciclos) };

    const useCase = new ListarCiclosVigentesUseCase(repo);
    const result = await useCase.execute();

    expect(result).toBe(ciclos);
    expect(repo.findAllActivos).toHaveBeenCalledTimes(1);
  });
});
