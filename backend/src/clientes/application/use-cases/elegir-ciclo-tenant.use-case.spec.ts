/**
 * elegir-ciclo-tenant.use-case.spec.ts — TDD RED→GREEN (T9.4, PR9).
 *
 * R21: el ADMINISTRADOR de un tenant adopta un ciclo del catálogo master.
 * - master no elegible (inexistente / activo=false / soft-deleted) → 404 CicloVigenteNotFound.
 * - solape con ciclo ACTIVO del tenant → 409 CicloOverlap.
 * - feliz → snapshot inactivo (activo=false) con link real a cicloVigenteId.
 */
import { describe, expect, it, vi } from 'vitest';
import { ElegirCicloTenantUseCase } from './elegir-ciclo-tenant.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import { CicloOverlapError, CicloVigenteNotFoundError } from '../../domain/errors/clientes.errors';

function buildCicloVigenteRepoMock(master: CicloVigenteEntity | null): ICicloVigenteRepository {
  return {
    findById: vi.fn().mockResolvedValue(master),
    save: vi.fn(),
  };
}

function buildCicloClienteRepoMock(activos: CicloClienteEntity[]): ICicloClienteRepository {
  return {
    findById: vi.fn(),
    findActivos: vi.fn().mockResolvedValue(activos),
    save: vi.fn().mockResolvedValue(undefined),
    activarCiclo: vi.fn(),
  };
}

describe('ElegirCicloTenantUseCase', () => {
  it('retorna Result.fail(CicloVigenteNotFoundError) cuando el master no existe', async () => {
    const cicloVigenteRepo = buildCicloVigenteRepoMock(null);
    const cicloClienteRepo = buildCicloClienteRepoMock([]);
    const useCase = new ElegirCicloTenantUseCase(cicloVigenteRepo, cicloClienteRepo);

    const result = await useCase.execute({ cicloVigenteId: 'id-inexistente' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(cicloClienteRepo.save).not.toHaveBeenCalled();
  });

  it('retorna Result.fail(CicloVigenteNotFoundError) cuando el master está inactivo', async () => {
    const masterInactivo = CicloVigenteEntity.reconstitute(
      {
        nombre: 'Ciclo viejo',
        fechaInicio: new Date('2025-01-01'),
        fechaFin: new Date('2025-12-31'),
        activo: false,
      },
      'master-inactivo',
      new Date(),
      new Date(),
      null,
    );
    const cicloVigenteRepo = buildCicloVigenteRepoMock(masterInactivo);
    const cicloClienteRepo = buildCicloClienteRepoMock([]);
    const useCase = new ElegirCicloTenantUseCase(cicloVigenteRepo, cicloClienteRepo);

    const result = await useCase.execute({ cicloVigenteId: 'master-inactivo' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
  });

  it('retorna Result.fail(CicloOverlapError) cuando solapa con un ciclo ACTIVO del tenant', async () => {
    const master = CicloVigenteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    });
    const cicloVigenteRepo = buildCicloVigenteRepoMock(master);

    const activoExistente = CicloClienteEntity.create({
      nombre: 'Ciclo 2026 (ya adoptado)',
      fechaInicio: new Date('2026-06-01'),
      fechaFin: new Date('2027-06-01'),
      activo: true,
      cicloVigenteId: 'otro-master',
    });
    const cicloClienteRepo = buildCicloClienteRepoMock([activoExistente]);

    const useCase = new ElegirCicloTenantUseCase(cicloVigenteRepo, cicloClienteRepo);
    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloOverlapError);
    expect(cicloClienteRepo.save).not.toHaveBeenCalled();
  });

  it('crea el snapshot inactivo cuando el master es elegible y no hay solape', async () => {
    const master = CicloVigenteEntity.create({
      nombre: 'Ciclo 2026',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: true,
    });
    const cicloVigenteRepo = buildCicloVigenteRepoMock(master);
    const cicloClienteRepo = buildCicloClienteRepoMock([]);

    const useCase = new ElegirCicloTenantUseCase(cicloVigenteRepo, cicloClienteRepo);
    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isOk()).toBe(true);
    const ciclo = result.getValue();
    expect(ciclo.nombre).toBe('Ciclo 2026');
    expect(ciclo.activo).toBe(false);
    expect(ciclo.cicloVigenteId).toBe(master.id);
    expect(cicloClienteRepo.save).toHaveBeenCalledWith(ciclo);
  });
});
