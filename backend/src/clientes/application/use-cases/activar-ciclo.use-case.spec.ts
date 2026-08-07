/**
 * activar-ciclo.use-case.spec.ts — TDD RED→GREEN (T9.5, PR9).
 *
 * R22: el ADMINISTRADOR activa un ciclo del tenant. Inexistente → 404
 * CicloClienteNotFound; feliz → transacción que desactiva el resto y activa
 * el objetivo (invariante: máximo uno activo por tenant).
 */
import { describe, expect, it, vi } from 'vitest';
import { ActivarCicloUseCase } from './activar-ciclo.use-case';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { CicloClienteNotFoundError } from '../../domain/errors/clientes.errors';

function buildRepoMock(overrides: Partial<ICicloClienteRepository> = {}): ICicloClienteRepository {
  return {
    findById: vi.fn(),
    findActivos: vi.fn(),
    save: vi.fn(),
    activarCiclo: vi.fn(),
    ...overrides,
  };
}

describe('ActivarCicloUseCase', () => {
  it('retorna Result.fail(CicloClienteNotFoundError) cuando el ciclo no existe en el tenant', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new ActivarCicloUseCase(repo);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloClienteNotFoundError);
    expect(repo.activarCiclo).not.toHaveBeenCalled();
  });

  it('activa el ciclo (transacción: desactiva el resto, activa el objetivo) cuando existe', async () => {
    const cicloInactivo = CicloClienteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: false,
      cicloVigenteId: 'master-id',
    });
    const repo = buildRepoMock({
      findById: vi.fn().mockResolvedValue(cicloInactivo),
      activarCiclo: vi.fn().mockResolvedValue(true),
    });
    const useCase = new ActivarCicloUseCase(repo);

    const result = await useCase.execute(cicloInactivo.id);

    expect(result.isOk()).toBe(true);
    expect(repo.activarCiclo).toHaveBeenCalledWith(cicloInactivo.id);
    expect(result.getValue().activo).toBe(true);
  });

  it('retorna Result.fail(CicloClienteNotFoundError) si activarCiclo retorna false (carrera extrema)', async () => {
    const ciclo = CicloClienteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: false,
      cicloVigenteId: 'master-id',
    });
    const repo = buildRepoMock({
      findById: vi.fn().mockResolvedValue(ciclo),
      activarCiclo: vi.fn().mockResolvedValue(false),
    });
    const useCase = new ActivarCicloUseCase(repo);

    const result = await useCase.execute(ciclo.id);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloClienteNotFoundError);
  });
});
