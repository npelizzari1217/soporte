/**
 * quitar-logo-cliente.use-case.spec.ts — TDD RED phase (sdd/logo-por-cliente,
 * WU2, 2.3). Idempotente (spec, regla 11): quitar el logo de un cliente que
 * no tiene uno reporta éxito igual, sin error y sin tocar el storage.
 */
import { describe, expect, it, vi } from 'vitest';
import { QuitarLogoClienteUseCase } from './quitar-logo-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
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

function buildFileStorageMock(overrides: Partial<IFileStorage> = {}): IFileStorage {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    retrieve: vi.fn(),
    ...overrides,
  };
}

function buildCliente(props: Partial<Parameters<typeof ClienteEntity.create>[0]> = {}): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    ...props,
  });
}

describe('QuitarLogoClienteUseCase (2.3)', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const fileStorage = buildFileStorageMock();
    const useCase = new QuitarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('es idempotente: quitar el logo de un cliente sin logo reporta éxito sin tocar storage ni persistir', async () => {
    const cliente = buildCliente();
    const save = vi.fn().mockResolvedValue(undefined);
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const fileStorage = buildFileStorageMock();
    const useCase = new QuitarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(fileStorage.delete).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('limpia las 3 props del logo, persiste, y borra la key del storage BEST-EFFORT', async () => {
    const cliente = buildCliente({
      logoStorageKey: 'clientes/abc/key-actual',
      logoMimeType: 'image/png',
      logoUpdatedAt: new Date('2026-01-01'),
    });
    const save = vi.fn().mockResolvedValue(undefined);
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const fileStorage = buildFileStorageMock();
    const useCase = new QuitarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(cliente.logoStorageKey).toBeNull();
    expect(cliente.logoMimeType).toBeNull();
    expect(cliente.logoUpdatedAt).toBeNull();
    expect(save).toHaveBeenCalledWith(cliente);
    expect(fileStorage.delete).toHaveBeenCalledWith('clientes/abc/key-actual');
  });

  it('si el delete del storage falla, la operación IGUAL reporta éxito', async () => {
    const cliente = buildCliente({
      logoStorageKey: 'clientes/abc/key-actual',
      logoMimeType: 'image/png',
      logoUpdatedAt: new Date('2026-01-01'),
    });
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock({
      delete: vi.fn().mockRejectedValue(new Error('disco lleno')),
    });
    const useCase = new QuitarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
  });
});
