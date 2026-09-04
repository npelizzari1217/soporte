/**
 * ver-correo-cliente.use-case.spec.ts — lectura pura (D7, cierre de hueco
 * post-WU4, ver mem #2365/#2364).
 *
 * Foco: 404 si el cliente no existe; NUNCA llama a `save`/`saveVerificationOutcome`
 * (una lectura no puede invalidar el caché de transporters de WU5); y el
 * `Result` devuelto no porta la contraseña bajo ninguna clave.
 */
import { describe, expect, it, vi } from 'vitest';
import { VerCorreoClienteUseCase } from './ver-correo-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IClienteEmailConfigRepository } from '../../domain/ports/i-cliente-email-config.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

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

function buildEmailConfigRepoMock(): IClienteEmailConfigRepository {
  return {
    findForSend: vi.fn(),
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
    saveVerificationOutcome: vi.fn(),
    clear: vi.fn(),
  };
}

describe('VerCorreoClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildClienteRepoMock(null);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new VerCorreoClienteUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute('inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
  });

  it('[CRITICAL] es de SOLO LECTURA: nunca llama a save() ni a saveVerificationOutcome()', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new VerCorreoClienteUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(emailConfigRepo.findState).toHaveBeenCalledWith(cliente.id);
    expect(emailConfigRepo.save).not.toHaveBeenCalled();
    expect(emailConfigRepo.saveVerificationOutcome).not.toHaveBeenCalled();
    expect(emailConfigRepo.clear).not.toHaveBeenCalled();
  });

  it('[CRITICAL] el Result devuelto nunca porta la contraseña bajo ninguna clave', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new VerCorreoClienteUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute(cliente.id);

    expect(Object.keys(result.getValue())).not.toContain('password');
  });
});
