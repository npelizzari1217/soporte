/**
 * desactivar-ciclo.use-case.spec.ts — contraparte de activar (sdd: ciclos
 * activar/desactivar). Inexistente → 404 CicloClienteNotFound; feliz →
 * marca el ciclo inactivo y lo persiste (SIN tocar los demás; 0 activos es
 * un estado válido).
 */
import { describe, expect, it, vi } from 'vitest';
import { DesactivarCicloUseCase } from './desactivar-ciclo.use-case';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { CicloClienteNotFoundError } from '../../domain/errors/clientes.errors';

function buildRepoMock(overrides: Partial<ICicloClienteRepository> = {}): ICicloClienteRepository {
  return {
    findById: vi.fn(),
    findActivos: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    activarCiclo: vi.fn(),
    ...overrides,
  };
}

describe('DesactivarCicloUseCase', () => {
  it('retorna Result.fail(CicloClienteNotFoundError) cuando el ciclo no existe en el tenant', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new DesactivarCicloUseCase(repo);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloClienteNotFoundError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('desactiva el ciclo activo y lo persiste (sin efecto sobre los demás)', async () => {
    const cicloActivo = CicloClienteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
      cicloVigenteId: 'master-id',
    });
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cicloActivo), save });
    const useCase = new DesactivarCicloUseCase(repo);

    const result = await useCase.execute(cicloActivo.id);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
    expect(save).toHaveBeenCalledWith(cicloActivo);
    // Desactivar NO usa la transacción de exclusión mutua (esa es de activar).
    expect(repo.activarCiclo).not.toHaveBeenCalled();
  });
});
