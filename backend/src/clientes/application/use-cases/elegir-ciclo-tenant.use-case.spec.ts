/**
 * T3.6 [RED] — Unit tests de ElegirCicloTenantUseCase (reemplaza CrearCicloTenantUseCase).
 *
 * Cubre ADR-3/ADR-4/ADR-6: elegir del catálogo master con validación de
 * elegibilidad + snapshot de nombre/fechas + link real (cicloVigenteId).
 */
import { ElegirCicloTenantUseCase } from './elegir-ciclo-tenant.use-case';
import { ICicloVigenteRepository } from '../../domain/ports/i-ciclo-vigente.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloVigenteEntity } from '../../domain/entities/ciclo-vigente.entity';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import {
  CicloVigenteNotFoundError,
  CicloVigenteOverlapError,
} from '../../domain/errors/clientes.errors';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeMaster(
  overrides?: Partial<{ activo: boolean; deletedAtOverride: Date }>,
): CicloVigenteEntity {
  const master = CicloVigenteEntity.create({
    nombre: 'Ejercicio Master 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: overrides?.activo ?? true,
  });
  if (overrides?.deletedAtOverride) {
    master.softDelete(overrides.deletedAtOverride);
  }
  return master;
}

function makeCicloTenant(overrides?: Partial<{ activo: boolean }>): CicloClienteEntity {
  return CicloClienteEntity.create({
    nombre: 'Ciclo Tenant Activo',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: overrides?.activo ?? true,
    cicloVigenteId: 'otro-master-id',
  });
}

function makeMockVigenteRepo(): vi.Mocked<ICicloVigenteRepository> {
  return {
    findById: vi.fn(),
    findAllNonDeleted: vi.fn(),
    findActiveNonDeleted: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

function makeMockClienteRepo(): vi.Mocked<ICicloClienteRepository> {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    activarCiclo: vi.fn(),
    findActive: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ElegirCicloTenantUseCase (T3.6)', () => {
  let useCase: ElegirCicloTenantUseCase;
  let vigenteRepo: vi.Mocked<ICicloVigenteRepository>;
  let clienteRepo: vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    vigenteRepo = makeMockVigenteRepo();
    clienteRepo = makeMockClienteRepo();
    clienteRepo.findAll.mockResolvedValue([]);
    useCase = new ElegirCicloTenantUseCase(vigenteRepo, clienteRepo);
  });

  it('cicloVigenteId no existe en master → CicloVigenteNotFoundError, tenantRepo.save NO llamado', async () => {
    vigenteRepo.findById.mockResolvedValue(null);

    const result = await useCase.execute({ cicloVigenteId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(clienteRepo.save).not.toHaveBeenCalled();
  });

  it('cicloVigenteId existe pero activo=false → CicloVigenteNotFoundError (no elegible)', async () => {
    const master = makeMaster({ activo: false });
    vigenteRepo.findById.mockResolvedValue(master);

    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(clienteRepo.save).not.toHaveBeenCalled();
  });

  it('cicloVigenteId existe pero deletedAt !== null → CicloVigenteNotFoundError', async () => {
    const master = makeMaster({ activo: true, deletedAtOverride: new Date('2026-02-01') });
    vigenteRepo.findById.mockResolvedValue(master);

    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteNotFoundError);
    expect(clienteRepo.save).not.toHaveBeenCalled();
  });

  it('master elegible → snapshot de nombre/fechas + cicloVigenteId real + activo=false', async () => {
    const master = makeMaster({ activo: true });
    vigenteRepo.findById.mockResolvedValue(master);

    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isOk()).toBe(true);
    const ciclo = result.getValue();
    expect(ciclo.nombre).toBe(master.nombre);
    expect(ciclo.fechaInicio).toEqual(master.fechaInicio);
    expect(ciclo.fechaFin).toEqual(master.fechaFin);
    expect(ciclo.cicloVigenteId).toBe(master.id);
    expect(ciclo.activo).toBe(false);
  });

  it('fechas del master solapan con ciclo activo del tenant → CicloVigenteOverlapError', async () => {
    const master = makeMaster({ activo: true }); // 2026-01-01 a 2026-12-31
    vigenteRepo.findById.mockResolvedValue(master);
    const cicloActivoTenant = makeCicloTenant({ activo: true });
    clienteRepo.findAll.mockResolvedValue([cicloActivoTenant]);

    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
    expect(clienteRepo.save).not.toHaveBeenCalled();
  });

  it('ciclos inactivos/soft-deleted del tenant NO bloquean por solapamiento', async () => {
    const master = makeMaster({ activo: true });
    vigenteRepo.findById.mockResolvedValue(master);
    const cicloInactivoTenant = makeCicloTenant({ activo: false });
    clienteRepo.findAll.mockResolvedValue([cicloInactivoTenant]);

    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isOk()).toBe(true);
  });

  it('éxito → tenantRepo.save(ciclo) llamado una vez, Result.ok', async () => {
    const master = makeMaster({ activo: true });
    vigenteRepo.findById.mockResolvedValue(master);

    const result = await useCase.execute({ cicloVigenteId: master.id });

    expect(result.isOk()).toBe(true);
    expect(clienteRepo.save).toHaveBeenCalledOnce();
    expect(clienteRepo.save).toHaveBeenCalledWith(result.getValue());
  });
});
