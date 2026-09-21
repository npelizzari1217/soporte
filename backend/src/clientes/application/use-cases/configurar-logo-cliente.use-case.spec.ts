/**
 * configurar-logo-cliente.use-case.spec.ts — TDD RED phase (sdd/logo-por-cliente,
 * WU2, 2.3). Orden de escritura (design.md D5): key nueva (UUID) → upload →
 * persistir fila → delete de la key anterior BEST-EFFORT. Un fallo del
 * delete NUNCA hace fallar la operación (un huérfano en disco es más barato
 * que una fila apuntando a la nada).
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigurarLogoClienteUseCase } from './configurar-logo-cliente.use-case';
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

function buildCliente(
  props: Partial<Parameters<typeof ClienteEntity.create>[0]> = {},
): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    ...props,
  });
}

describe('ConfigurarLogoClienteUseCase (2.3)', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const fileStorage = buildFileStorageMock();
    const useCase = new ConfigurarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute({
      clienteId: 'id-inexistente',
      buffer: Buffer.from('png'),
      mimeType: 'image/png',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(fileStorage.upload).not.toHaveBeenCalled();
    expect(clienteRepo.save).not.toHaveBeenCalled();
  });

  it('sube con una key nueva (UUID) bajo clientes/{clienteId}/{uuid} y persiste la fila', async () => {
    const cliente = buildCliente();
    const save = vi.fn().mockResolvedValue(undefined);
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente), save });
    const fileStorage = buildFileStorageMock();
    const useCase = new ConfigurarLogoClienteUseCase(clienteRepo, fileStorage);

    const buffer = Buffer.from('contenido-png');
    const result = await useCase.execute({
      clienteId: cliente.id,
      buffer,
      mimeType: 'image/png',
    });

    expect(result.isOk()).toBe(true);
    const [key, subidoBuffer, mime] = (fileStorage.upload as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(key).toMatch(new RegExp(`^clientes/${cliente.id}/[0-9a-f-]{36}$`));
    expect(subidoBuffer).toBe(buffer);
    expect(mime).toBe('image/png');
    expect(cliente.logoStorageKey).toBe(key);
    expect(cliente.logoMimeType).toBe('image/png');
    expect(cliente.logoUpdatedAt).not.toBeNull();
    expect(save).toHaveBeenCalledWith(cliente);
  });

  it('borra la key anterior BEST-EFFORT tras reemplazar el logo', async () => {
    const cliente = buildCliente({
      logoStorageKey: 'clientes/abc/key-vieja',
      logoMimeType: 'image/jpeg',
      logoUpdatedAt: new Date('2026-01-01'),
    });
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock();
    const useCase = new ConfigurarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute({
      clienteId: cliente.id,
      buffer: Buffer.from('nuevo'),
      mimeType: 'image/webp',
    });

    expect(result.isOk()).toBe(true);
    expect(fileStorage.delete).toHaveBeenCalledWith('clientes/abc/key-vieja');
  });

  it('si el delete de la key anterior falla, la operación IGUAL reporta éxito', async () => {
    const cliente = buildCliente({
      logoStorageKey: 'clientes/abc/key-vieja',
      logoMimeType: 'image/jpeg',
      logoUpdatedAt: new Date('2026-01-01'),
    });
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock({
      delete: vi.fn().mockRejectedValue(new Error('disco lleno')),
    });
    const useCase = new ConfigurarLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute({
      clienteId: cliente.id,
      buffer: Buffer.from('nuevo'),
      mimeType: 'image/webp',
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().logoMimeType).toBe('image/webp');
  });

  it('no intenta borrar ninguna key cuando el cliente no tenía logo previo', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock();
    const useCase = new ConfigurarLogoClienteUseCase(clienteRepo, fileStorage);

    await useCase.execute({
      clienteId: cliente.id,
      buffer: Buffer.from('x'),
      mimeType: 'image/png',
    });

    expect(fileStorage.delete).not.toHaveBeenCalled();
  });
});
