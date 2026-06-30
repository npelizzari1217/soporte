/**
 * T2.7 [RED] — Unit tests de ListarCiclosUseCase.
 *
 * Spec ref: clientes-tenancy/GET /ciclos
 * DOD: test en RED (use case no existe aún).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListarCiclosUseCase } from './listar-ciclos.use-case';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeCiclo(overrides?: Partial<{ activo: boolean; nombre: string }>): CicloClienteEntity {
  return CicloClienteEntity.create({
    nombre: overrides?.nombre ?? 'Ejercicio 2026',
    fechaInicio: new Date('2026-01-01'),
    fechaFin: new Date('2026-12-31'),
    activo: overrides?.activo ?? true,
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

describe('ListarCiclosUseCase', () => {
  let useCase: ListarCiclosUseCase;
  let repo: vi.Mocked<ICicloClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ListarCiclosUseCase(repo);
  });

  it('retorna ciclos del tenant resuelto únicamente (delegado a TenantContext en infra)', async () => {
    const ciclo1 = makeCiclo({ nombre: 'Ciclo A' });
    const ciclo2 = makeCiclo({ nombre: 'Ciclo B', activo: false });
    repo.findAll.mockResolvedValue([ciclo1, ciclo2]);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
  });

  it('array vacío cuando no hay ciclos → 200 (no 404)', async () => {
    repo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('cada ítem incluye: id, nombre, fechaInicio, fechaFin, activo', async () => {
    const ciclo = makeCiclo();
    repo.findAll.mockResolvedValue([ciclo]);

    const result = await useCase.execute();

    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('nombre');
    expect(result[0]).toHaveProperty('fechaInicio');
    expect(result[0]).toHaveProperty('fechaFin');
    expect(result[0]).toHaveProperty('activo');
  });

  it('MUST NOT incluir ciclos de otro tenant (aislamiento garantizado por TenantContext — repo devuelve solo del tenant activo)', async () => {
    // El aislamiento real es en infra (TenantContext → PrismaClient del tenant).
    // Aquí verificamos que el use case NO filtra por tenant (no tiene lógica extra):
    // si el repo devuelve N ciclos, el use case devuelve exactamente esos N.
    const ciclos = [makeCiclo({ nombre: 'A' }), makeCiclo({ nombre: 'B' })];
    repo.findAll.mockResolvedValue(ciclos);

    const result = await useCase.execute();

    expect(result).toHaveLength(2);
    expect(repo.findAll).toHaveBeenCalledOnce();
  });
});
