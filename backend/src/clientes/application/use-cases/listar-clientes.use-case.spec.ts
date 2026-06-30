/**
 * T2.2 [RED] — Unit tests de ListarClientesUseCase.
 *
 * Spec ref: clientes-tenancy/GET /clientes
 * DOD: test en RED (use case no existe aún).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListarClientesUseCase } from './listar-clientes.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeCliente(
  overrides?: Partial<{ activo: boolean; deletedAt: Date | null }>,
): ClienteEntity {
  const entity = ClienteEntity.create({
    nombre: 'Acme Corp',
    razonSocial: 'Acme S.A.',
    cuit: '20123456789',
    dbName: 'soporte_acme',
    activo: overrides?.activo ?? true,
  });
  if (overrides?.deletedAt !== undefined) {
    entity._deletedAt = overrides.deletedAt;
  }
  return entity;
}

function makeMockRepo(): vi.Mocked<IClienteRepository> {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ListarClientesUseCase', () => {
  let useCase: ListarClientesUseCase;
  let repo: vi.Mocked<IClienteRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    useCase = new ListarClientesUseCase(repo);
  });

  it('retorna array de clientes activos (deleted_at IS NULL)', async () => {
    const activo = makeCliente({ deletedAt: null });
    const eliminado = makeCliente({ deletedAt: new Date() });
    repo.findAll.mockResolvedValue([activo, eliminado]);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(activo.id);
  });

  it('retorna array vacío cuando no hay clientes activos (no 404)', async () => {
    repo.findAll.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });

  it('cada ítem incluye: id, nombre, activo, dbName, createdAt', async () => {
    const cliente = makeCliente({ deletedAt: null });
    repo.findAll.mockResolvedValue([cliente]);

    const result = await useCase.execute();

    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('nombre');
    expect(result[0]).toHaveProperty('activo');
    expect(result[0]).toHaveProperty('dbName');
    expect(result[0]).toHaveProperty('createdAt');
  });

  it('no expone passwords ni datos sensibles (solo campos de ClienteEntity)', async () => {
    const cliente = makeCliente({ deletedAt: null });
    repo.findAll.mockResolvedValue([cliente]);

    const result = await useCase.execute();
    const keys = Object.getOwnPropertyNames(result[0]);

    // ClienteEntity no tiene campo password ni adminPassword
    expect(keys).not.toContain('password');
    expect(keys).not.toContain('adminPassword');
    expect(keys).not.toContain('passwordHash');
  });
});
