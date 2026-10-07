/**
 * configurar-csat-cliente.use-case.spec.ts — prender/apagar `csat_habilitado`
 * por cliente (sdd/csat, WU10.2). Solo ROOT (gateado por `GlobalAdminGuard`
 * en `ClientesController`, mismo criterio que `EditarClienteUseCase`).
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigurarCsatClienteUseCase } from './configurar-csat-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

function buildRepoMock(overrides: Partial<IClienteRepository> = {}): IClienteRepository {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findBySlug: vi.fn(),
    congelarSlug: vi.fn(),
    fijarRequiere2fa: vi.fn(),
    obtenerRequiere2fa: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

function buildCliente(csatHabilitado = false): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    csatHabilitado,
  });
}

describe('ConfigurarCsatClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new ConfigurarCsatClienteUseCase(repo);

    const result = await useCase.execute({ clienteId: 'id-inexistente', habilitado: true });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('prende el flag y persiste', async () => {
    const cliente = buildCliente(false);
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const useCase = new ConfigurarCsatClienteUseCase(repo);

    const result = await useCase.execute({ clienteId: cliente.id, habilitado: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().csatHabilitado).toBe(true);
    expect(save).toHaveBeenCalledWith(cliente);
  });

  it('apaga el flag y persiste', async () => {
    const cliente = buildCliente(true);
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const useCase = new ConfigurarCsatClienteUseCase(repo);

    const result = await useCase.execute({ clienteId: cliente.id, habilitado: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().csatHabilitado).toBe(false);
    expect(save).toHaveBeenCalledWith(cliente);
  });
});
