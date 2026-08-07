/**
 * reactivar-cliente.use-case.spec.ts — revierte la baja lógica (ROOT).
 * Inexistente → 404 ClienteNoEncontrado; feliz → reactivate() (activo=true +
 * limpia deletedAt) y persiste.
 */
import { describe, expect, it, vi } from 'vitest';
import { ReactivarClienteUseCase } from './reactivar-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

function buildRepoMock(overrides: Partial<IClienteRepository> = {}): IClienteRepository {
  return {
    findById: vi.fn(),
    findByDbName: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('ReactivarClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new ReactivarClienteUseCase(repo);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('reactiva el cliente suspendido (activo=true + limpia deletedAt) y lo persiste', async () => {
    const cliente = ClienteEntity.create({
      nombre: 'ACME S.A.',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_deadbeef',
      activo: false,
    });
    cliente.suspend();
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const useCase = new ReactivarClienteUseCase(repo);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
    expect(result.getValue().isDeleted()).toBe(false);
    expect(save).toHaveBeenCalledWith(cliente);
  });
});
