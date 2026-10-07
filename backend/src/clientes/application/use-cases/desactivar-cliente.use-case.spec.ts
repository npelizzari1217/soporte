/**
 * desactivar-cliente.use-case.spec.ts — baja lógica de clientes (ROOT).
 * Inexistente → 404 ClienteNoEncontrado; feliz → suspend() (activo=false +
 * soft delete) y persiste, sin dropear la DB física.
 */
import { describe, expect, it, vi } from 'vitest';
import { DesactivarClienteUseCase } from './desactivar-cliente.use-case';
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

describe('DesactivarClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new DesactivarClienteUseCase(repo);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('suspende el cliente (activo=false + soft delete) y lo persiste', async () => {
    const cliente = ClienteEntity.create({
      nombre: 'ACME S.A.',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_deadbeef',
      activo: true,
    });
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const useCase = new DesactivarClienteUseCase(repo);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
    expect(result.getValue().isDeleted()).toBe(true);
    expect(save).toHaveBeenCalledWith(cliente);
  });
});
