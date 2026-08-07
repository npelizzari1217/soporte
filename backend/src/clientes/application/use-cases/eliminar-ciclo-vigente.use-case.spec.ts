/**
 * eliminar-ciclo-vigente.use-case.spec.ts — TDD RED→GREEN (sdd/ciclos-abm-root).
 *
 * ROOT da de baja (soft-delete) un ciclo del catálogo master. Un ciclo ya
 * adoptado por algún tenant NO se ve afectado: la referencia del tenant
 * (`ciclos_cliente.ciclo_vigente_id`) es un soft-ref sin FK física
 * (ver `ciclo-vigente.entity.ts`), y el soft-delete solo saca al ciclo de
 * `findAllActivos()`/`findAll()` filtrado — no borra ni toca ninguna fila
 * del lado tenant.
 */
import { describe, expect, it, vi } from 'vitest';
import { EliminarCicloVigenteUseCase } from './eliminar-ciclo-vigente.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';

function buildRepoMock(): Pick<ICicloVigenteRepository, 'findById' | 'save'> {
  return {
    findById: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('EliminarCicloVigenteUseCase', () => {
  it('da de baja lógica el ciclo y persiste', async () => {
    const repo = buildRepoMock();
    const ciclo = CicloVigenteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    });
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ciclo);
    const useCase = new EliminarCicloVigenteUseCase(repo);

    const result = await useCase.execute({ cicloVigenteId: ciclo.id });

    expect(result.isOk()).toBe(true);
    expect(ciclo.isDeleted()).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(ciclo);
  });

  it('retorna Result.fail(CicloVigenteNotFoundError) cuando el ciclo no existe', async () => {
    const repo = buildRepoMock();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const useCase = new EliminarCicloVigenteUseCase(repo);

    const result = await useCase.execute({ cicloVigenteId: 'inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('retorna Result.fail(CicloVigenteNotFoundError) cuando el ciclo ya está soft-deleted (idempotencia)', async () => {
    const repo = buildRepoMock();
    const ciclo = CicloVigenteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    });
    ciclo.softDelete();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ciclo);
    const useCase = new EliminarCicloVigenteUseCase(repo);

    const result = await useCase.execute({ cicloVigenteId: ciclo.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
