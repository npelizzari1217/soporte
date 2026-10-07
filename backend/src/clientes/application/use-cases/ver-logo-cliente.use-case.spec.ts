/**
 * ver-logo-cliente.use-case.spec.ts — TDD RED phase (sdd/logo-por-cliente,
 * WU2, 2.3). La AUTORIZACIÓN (aislamiento entre inquilinos) vive en el
 * controller (design.md, tabla "Autorización: los dos lugares"), NUNCA acá:
 * este use case solo resuelve "¿hay logo para este clienteId?" una vez que
 * el caller ya decidió que puede pedirlo.
 */
import { describe, expect, it, vi } from 'vitest';
import { VerLogoClienteUseCase } from './ver-logo-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IFileStorage } from '../../../shared/domain/ports/i-file-storage';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import {
  ClienteNoEncontradoError,
  LogoClienteNoEncontradoError,
} from '../../domain/errors/clientes.errors';

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

describe('VerLogoClienteUseCase (2.3)', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(null) });
    const fileStorage = buildFileStorageMock();
    const useCase = new VerLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute('id-inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('retorna Result.fail(LogoClienteNoEncontradoError) cuando el cliente no tiene logo', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock();
    const useCase = new VerLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute(cliente.id);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(LogoClienteNoEncontradoError);
    expect(fileStorage.retrieve).not.toHaveBeenCalled();
  });

  it('retorna Result.fail(LogoClienteNoEncontradoError) cuando la fila apunta a una key que el storage ya no tiene', async () => {
    const cliente = buildCliente({
      logoStorageKey: 'clientes/abc/huerfano',
      logoMimeType: 'image/png',
      logoUpdatedAt: new Date('2026-01-01'),
    });
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock({ retrieve: vi.fn().mockResolvedValue(null) });
    const useCase = new VerLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute(cliente.id);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(LogoClienteNoEncontradoError);
  });

  it('retorna el buffer y el mimeType almacenado cuando el cliente tiene logo', async () => {
    const buffer = Buffer.from('binario-png');
    const cliente = buildCliente({
      logoStorageKey: 'clientes/abc/key-actual',
      logoMimeType: 'image/webp',
      logoUpdatedAt: new Date('2026-01-01'),
    });
    const clienteRepo = buildRepoMock({ findById: vi.fn().mockResolvedValue(cliente) });
    const fileStorage = buildFileStorageMock({ retrieve: vi.fn().mockResolvedValue(buffer) });
    const useCase = new VerLogoClienteUseCase(clienteRepo, fileStorage);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual({ buffer, mimeType: 'image/webp' });
    expect(fileStorage.retrieve).toHaveBeenCalledWith('clientes/abc/key-actual');
  });
});
