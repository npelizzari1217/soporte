/**
 * T2.9 [RED] — Unit tests de CrearCicloTenantUseCase.
 *
 * Spec ref: clientes-tenancy/POST /ciclos
 * DOD: test en RED (use case no existe aún).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrearCicloTenantUseCase } from './crear-ciclo-tenant.use-case';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';
import {
  CicloVigenteOverlapError,
  CicloVigenteInvalidDatesError,
} from '../../domain/errors/clientes.errors';

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeCicloActivo(): CicloClienteEntity {
  return CicloClienteEntity.create({
    nombre: 'Ciclo Activo',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: true,
  });
}

function makeMockRepo(): vi.Mocked<ICicloClienteRepository> {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    activarCiclo: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CrearCicloTenantUseCase', () => {
  let useCase: CrearCicloTenantUseCase;
  let repo: vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    repo.findAll.mockResolvedValue([]);
    useCase = new CrearCicloTenantUseCase(repo);
  });

  it('crea ciclo con activo=FALSE por defecto', async () => {
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute({
      nombre: 'Ciclo 2027',
      fechaInicio: new Date('2027-01-01'),
      fechaFin: new Date('2027-12-31'),
    });

    expect(result.isOk()).toBe(true);
    const ciclo = result.getValue();
    expect(ciclo.activo).toBe(false);
  });

  it('fecha_fin < fecha_inicio → error de validación (CicloVigenteInvalidDatesError)', async () => {
    // La validación ocurre en CicloClienteEntity.create() que lanza el error
    // El use case debe capturarlo y convertirlo en Result.fail
    const result = await useCase.execute({
      nombre: 'Ciclo Inválido',
      fechaInicio: new Date('2027-12-31'),
      fechaFin: new Date('2027-01-01'),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteInvalidDatesError);
  });

  it('fechas solapan con ciclo activo existente → CicloVigenteOverlapError', async () => {
    const cicloActivo = makeCicloActivo(); // 2026-01-01 a 2026-12-31
    repo.findAll.mockResolvedValue([cicloActivo]);

    const result = await useCase.execute({
      nombre: 'Ciclo Solapado',
      fechaInicio: new Date('2026-06-01'),
      fechaFin: new Date('2027-06-30'),
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CicloVigenteOverlapError);
  });

  it('respuesta incluye id del ciclo creado', async () => {
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute({
      nombre: 'Ciclo 2027',
      fechaInicio: new Date('2027-01-01'),
      fechaFin: new Date('2027-12-31'),
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBeTruthy();
  });

  it('ciclos inactivos no bloquean la creación (solo activos solapan)', async () => {
    // Ciclo inactivo con mismas fechas no debe bloquear
    const cicloInactivo = CicloClienteEntity.create({
      nombre: 'Ciclo Inactivo',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
      activo: false,
    });
    repo.findAll.mockResolvedValue([cicloInactivo]);
    repo.save.mockResolvedValue(undefined);

    const result = await useCase.execute({
      nombre: 'Ciclo 2026 bis',
      fechaInicio: new Date('2026-01-01'),
      fechaFin: new Date('2026-12-31'),
    });

    expect(result.isOk()).toBe(true);
  });

  it('guarda el ciclo en el repositorio al crear exitosamente', async () => {
    repo.save.mockResolvedValue(undefined);

    await useCase.execute({
      nombre: 'Ciclo 2027',
      fechaInicio: new Date('2027-01-01'),
      fechaFin: new Date('2027-12-31'),
    });

    expect(repo.save).toHaveBeenCalledOnce();
  });
});
