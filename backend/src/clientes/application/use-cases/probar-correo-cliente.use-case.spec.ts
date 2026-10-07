/**
 * probar-correo-cliente.use-case.spec.ts — "Probar conexión" bajo demanda
 * (D6): no toca la config guardada, solo persiste el resultado saneado.
 */
import { describe, expect, it, vi } from 'vitest';
import { ProbarCorreoClienteUseCase } from './probar-correo-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteEmailConfigForSend,
  IClienteEmailConfigRepository,
} from '../../domain/ports/i-cliente-email-config.repository';
import { IEmailConnectionVerifier } from '../../../shared/domain/ports/i-email-connection-verifier.port';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import {
  ClienteNoEncontradoError,
  CorreoNoConfiguradoError,
} from '../../domain/errors/clientes.errors';

function buildCliente(): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
  });
}

function buildClienteRepoMock(cliente: ClienteEntity | null): IClienteRepository {
  return {
    findById: vi.fn().mockResolvedValue(cliente),
    findByDbName: vi.fn(),
    findBySlug: vi.fn(),
    congelarSlug: vi.fn(),
    fijarRequiere2fa: vi.fn(),
    obtenerRequiere2fa: vi.fn(),
    cambiarSlugSiNoCongelado: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  };
}

function buildEmailConfigRepoMock(
  overrides: Partial<IClienteEmailConfigRepository> = {},
): IClienteEmailConfigRepository {
  return {
    findForSend: vi.fn().mockResolvedValue(null),
    findState: vi.fn().mockResolvedValue({
      configurado: true,
      host: 'smtp.acme.com',
      port: 587,
      user: 'u',
      secure: false,
      from: 'from@acme.com',
      verificadoAt: new Date('2026-08-20T12:00:00Z'),
      verificacionError: null,
    }),
    save: vi.fn(),
    saveVerificationOutcome: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    ...overrides,
  };
}

const CONFIG_ACTUAL: ClienteEmailConfigForSend = {
  host: 'smtp.acme.com',
  port: 587,
  user: 'u',
  password: 'password-en-claro',
  secure: false,
  from: 'from@acme.com',
  configRevision: 1,
};

describe('ProbarCorreoClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildClienteRepoMock(null);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const verifier: IEmailConnectionVerifier = { verify: vi.fn() };
    const useCase = new ProbarCorreoClienteUseCase(clienteRepo, emailConfigRepo, verifier);

    const result = await useCase.execute('inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('retorna Result.fail(CorreoNoConfiguradoError) cuando el cliente no tiene config guardada', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock({
      findForSend: vi.fn().mockResolvedValue(null),
    });
    const verifier: IEmailConnectionVerifier = { verify: vi.fn() };
    const useCase = new ProbarCorreoClienteUseCase(clienteRepo, emailConfigRepo, verifier);

    const result = await useCase.execute(cliente.id);

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CorreoNoConfiguradoError);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('verifica con la config actual, persiste el outcome y NO reescribe host/user/etc', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock({
      findForSend: vi.fn().mockResolvedValue(CONFIG_ACTUAL),
    });
    const verifier: IEmailConnectionVerifier = {
      verify: vi.fn().mockResolvedValue({ ok: true, motivo: null }),
    };
    const useCase = new ProbarCorreoClienteUseCase(clienteRepo, emailConfigRepo, verifier);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith({
      host: 'smtp.acme.com',
      port: 587,
      user: 'u',
      password: 'password-en-claro',
      secure: false,
    });
    expect(emailConfigRepo.saveVerificationOutcome).toHaveBeenCalledWith(cliente.id, {
      ok: true,
      motivo: null,
    });
    expect(emailConfigRepo.save).not.toHaveBeenCalled();
  });
});
