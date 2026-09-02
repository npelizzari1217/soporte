/**
 * quitar-correo-cliente.use-case.spec.ts — remoción explícita (D7, único
 * camino de borrado — un string vacío NUNCA borra, ver
 * configurar-correo-cliente.use-case.spec.ts).
 */
import { describe, expect, it, vi } from 'vitest';
import { QuitarCorreoClienteUseCase } from './quitar-correo-cliente.use-case';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { IClienteEmailConfigRepository } from '../../domain/ports/i-cliente-email-config.repository';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

function buildCliente(): ClienteEntity {
  return ClienteEntity.create({
    nombre: 'ACME S.A.',
    razonSocial: null,
    cuit: null,
    dbName: 'soporte_deadbeef',
    activo: true,
    zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
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
      configurado: false,
      host: null,
      port: null,
      user: null,
      secure: null,
      from: null,
      verificadoAt: null,
      verificacionError: null,
    }),
    save: vi.fn(),
    saveVerificationOutcome: vi.fn(),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('QuitarCorreoClienteUseCase', () => {
  it('retorna Result.fail(ClienteNoEncontradoError) cuando el cliente no existe', async () => {
    const clienteRepo = buildClienteRepoMock(null);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new QuitarCorreoClienteUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute('inexistente');

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(ClienteNoEncontradoError);
    expect(emailConfigRepo.clear).not.toHaveBeenCalled();
  });

  it('limpia la config y retorna el estado "no configurado"', async () => {
    const cliente = buildCliente();
    const clienteRepo = buildClienteRepoMock(cliente);
    const emailConfigRepo = buildEmailConfigRepoMock();
    const useCase = new QuitarCorreoClienteUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute(cliente.id);

    expect(result.isOk()).toBe(true);
    expect(emailConfigRepo.clear).toHaveBeenCalledWith(cliente.id);
    expect(result.getValue().configurado).toBe(false);
  });
});
