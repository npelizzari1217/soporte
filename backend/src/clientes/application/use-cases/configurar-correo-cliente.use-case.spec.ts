/**
 * configurar-correo-cliente.use-case.spec.ts — guardar/editar la config SMTP
 * (D2, D6, D7, sdd/configuracion-correo-por-cliente WU4).
 *
 * Foco: preservar la contraseña omitida (D7, "EL bug clásico"), rechazar el
 * alta sin contraseña cuando no hay nada que preservar, traducir el fallo de
 * `EMAIL_CRYPTO_KEY` a 503 sin persistir nada, y que un handshake fallido
 * NO revierte el save (#2361/4). También prueba que el `Result` devuelto
 * (`ClienteEmailConfigState`) nunca porta la contraseña bajo ninguna clave.
 */
import { describe, expect, it, vi } from 'vitest';
import { ConfigurarCorreoClienteUseCase } from './configurar-correo-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteEmailConfigForSend,
  ClienteEmailConfigState,
  IClienteEmailConfigRepository,
} from '../../domain/ports/i-cliente-email-config.repository';
import { IEmailConnectionVerifier } from '../../../shared/domain/ports/i-email-connection-verifier.port';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import {
  ClienteNoEncontradoError,
  CorreoPasswordFaltanteError,
  EmailCryptoKeyAusenteError,
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
      host: 'smtp.nueva.com',
      port: 587,
      user: 'nuevo-user',
      secure: false,
      from: 'nuevo@acme.com',
      verificadoAt: null,
      verificacionError: null,
    } satisfies ClienteEmailConfigState),
    save: vi.fn().mockResolvedValue(undefined),
    saveVerificationOutcome: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildVerifierMock(ok = true): IEmailConnectionVerifier {
  return { verify: vi.fn().mockResolvedValue({ ok, motivo: ok ? null : 'Fallo de verificación' }) };
}

const COMMAND_BASE = {
  clienteId: 'x',
  host: 'smtp.nueva.com',
  port: 587,
  user: 'nuevo-user',
  secure: false,
  from: 'nuevo@acme.com',
};

describe('ConfigurarCorreoClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildClienteRepoMock(null);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new ConfigurarCorreoClienteUseCase(
      clienteRepo,
      emailConfigRepo,
      buildVerifierMock(),
    );

    const result = await useCase.execute({
      ...COMMAND_BASE,
      clienteId: 'inexistente',
      password: 'secreto',
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(emailConfigRepo.save).not.toHaveBeenCalled();
  });

  it('[CRITICAL] password omitido + cliente YA configurado: PRESERVA la contraseña existente', async () => {
    const cliente = buildCliente();
    const configActual: ClienteEmailConfigForSend = {
      host: 'smtp.vieja.com',
      port: 25,
      user: 'viejo-user',
      password: 'password-secreta-existente',
      secure: false,
      from: 'viejo@acme.com',
      configRevision: 111,
    };
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock({
      findForSend: vi.fn().mockResolvedValue(configActual),
    });
    const useCase = new ConfigurarCorreoClienteUseCase(
      clienteRepo,
      emailConfigRepo,
      buildVerifierMock(),
    );

    // ROOT edita solo el remitente, sin tocar `password` (undefined).
    const result = await useCase.execute({
      ...COMMAND_BASE,
      clienteId: cliente.id,
      password: undefined,
    });

    expect(result.isOk()).toBe(true);
    expect(emailConfigRepo.save).toHaveBeenCalledWith(
      cliente.id,
      expect.objectContaining({ password: 'password-secreta-existente' }),
    );
  });

  it('password omitido + cliente NO configurado: falla con CorreoPasswordFaltanteError, no guarda nada', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock({
      findForSend: vi.fn().mockResolvedValue(null),
    });
    const useCase = new ConfigurarCorreoClienteUseCase(
      clienteRepo,
      emailConfigRepo,
      buildVerifierMock(),
    );

    const result = await useCase.execute({
      ...COMMAND_BASE,
      clienteId: cliente.id,
      password: undefined,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CorreoPasswordFaltanteError);
    expect(emailConfigRepo.save).not.toHaveBeenCalled();
  });

  it('password nuevo rota el credential guardado (no toca findForSend)', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new ConfigurarCorreoClienteUseCase(
      clienteRepo,
      emailConfigRepo,
      buildVerifierMock(),
    );

    const result = await useCase.execute({
      ...COMMAND_BASE,
      clienteId: cliente.id,
      password: 'nueva-pass',
    });

    expect(result.isOk()).toBe(true);
    expect(emailConfigRepo.findForSend).not.toHaveBeenCalled();
    expect(emailConfigRepo.save).toHaveBeenCalledWith(
      cliente.id,
      expect.objectContaining({ password: 'nueva-pass' }),
    );
  });

  it('[CRITICAL] falta EMAIL_CRYPTO_KEY al guardar → 503, nada persistido, no verifica', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock({
      save: vi
        .fn()
        .mockRejectedValue(
          new Error('EMAIL_CRYPTO_KEY ausente o inválida — no se puede cifrar el secreto'),
        ),
    });
    const verifier = buildVerifierMock();
    const useCase = new ConfigurarCorreoClienteUseCase(clienteRepo, emailConfigRepo, verifier);

    const result = await useCase.execute({ ...COMMAND_BASE, clienteId: cliente.id, password: 'x' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EmailCryptoKeyAusenteError);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(emailConfigRepo.saveVerificationOutcome).not.toHaveBeenCalled();
  });

  it('un error de save NO relacionado con la clave se re-lanza (no se enmascara como 503)', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock({
      save: vi.fn().mockRejectedValue(new Error('P2025: Record to update not found')),
    });
    const useCase = new ConfigurarCorreoClienteUseCase(
      clienteRepo,
      emailConfigRepo,
      buildVerifierMock(),
    );

    await expect(
      useCase.execute({ ...COMMAND_BASE, clienteId: cliente.id, password: 'x' }),
    ).rejects.toThrow('P2025');
  });

  it('un handshake fallido NO revierte el save — persiste el motivo y retorna ok (#2361/4)', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const verifier = buildVerifierMock(false);
    const useCase = new ConfigurarCorreoClienteUseCase(clienteRepo, emailConfigRepo, verifier);

    const result = await useCase.execute({ ...COMMAND_BASE, clienteId: cliente.id, password: 'x' });

    expect(result.isOk()).toBe(true);
    expect(emailConfigRepo.save).toHaveBeenCalledOnce();
    expect(emailConfigRepo.saveVerificationOutcome).toHaveBeenCalledWith(cliente.id, {
      ok: false,
      motivo: 'Fallo de verificación',
    });
  });

  it('[CRITICAL] el Result devuelto nunca porta la contraseña bajo ninguna clave', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new ConfigurarCorreoClienteUseCase(
      clienteRepo,
      emailConfigRepo,
      buildVerifierMock(),
    );

    const result = await useCase.execute({
      ...COMMAND_BASE,
      clienteId: cliente.id,
      password: 'super-secreta',
    });

    const value = result.getValue();
    expect(Object.keys(value)).not.toContain('password');
    expect(JSON.stringify(value)).not.toContain('super-secreta');
  });
});
