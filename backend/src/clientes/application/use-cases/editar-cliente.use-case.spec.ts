/**
 * editar-cliente.use-case.spec.ts — ABM de clientes (ROOT). Inexistente → 404
 * ClienteNoEncontrado; feliz → aplica los cambios provistos y persiste, sin
 * tocar el dbName (inmutable).
 */
import { describe, expect, it, vi } from 'vitest';
import { EditarClienteUseCase } from './editar-cliente.use-case';
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

function buildCliente(): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
  });
}

describe('EditarClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const useCase = new EditarClienteUseCase(repo);

    const result = await useCase.execute({ clienteId: 'id-inexistente', nombre: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('aplica los cambios provistos, persiste y NO altera el dbName', async () => {
    const cliente = buildCliente();
    const save = vi.fn().mockResolvedValue(undefined);
    const repo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const useCase = new EditarClienteUseCase(repo);

    const result = await useCase.execute({
      clienteId: cliente.id,
      nombre: 'ACME Modificada',
      razonSocial: 'ACME Sociedad Anónima',
      cuit: '30-12345678-9',
    });

    expect(result.isOk()).toBe(true);
    const editado = result.getValue();
    expect(editado.nombre).toBe('ACME Modificada');
    expect(editado.razonSocial).toBe('ACME Sociedad Anónima');
    expect(editado.cuit).toBe('30-12345678-9');
    expect(editado.dbName).toBe('soporte_deadbeef');
    expect(save).toHaveBeenCalledWith(cliente);
  });
});
