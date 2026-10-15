import { describe, it, expect, vi } from 'vitest';
import { ListarClientesUseCase } from './listar-clientes.use-case';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import type { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import type { IClienteEmailConfigRepository } from '../../domain/ports/i-cliente-email-config.repository';

function buildEmailConfigRepoMock(estado: { configurado: boolean; verificadoAt: Date | null }) {
  return {
    findState: vi.fn<IClienteEmailConfigRepository['findState']>().mockResolvedValue({
      configurado: estado.configurado,
      host: null,
      port: null,
      user: null,
      secure: null,
      from: null,
      verificadoAt: estado.verificadoAt,
      verificacionError: null,
    }),
  };
}

describe('ListarClientesUseCase (G3, sdd/beta-frontend — ROOT)', () => {
  it('retorna todos los clientes con su resumen de correo (el controller ya restringe a ROOT vía GlobalAdminGuard)', async () => {
    const clienteA = ClienteEntity.create({
      nombre: 'ACME',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_acme',
      activo: true,
    });
    const clienteRepo = {
      findAll: vi.fn<IClienteRepository['findAll']>().mockResolvedValue([clienteA]),
    };
    const verificadoAt = new Date('2026-08-20T12:00:00Z');
    const emailConfigRepo = buildEmailConfigRepoMock({ configurado: true, verificadoAt });
    const useCase = new ListarClientesUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([
      { cliente: clienteA, correo: { configurado: true, verificadoAt } },
    ]);
    expect(clienteRepo.findAll).toHaveBeenCalledOnce();
    expect(emailConfigRepo.findState).toHaveBeenCalledWith(clienteA.id);
  });

  it('[CRITICAL] el resumen de correo NUNCA incluye host/user/from/password — solo configurado + verificadoAt', async () => {
    const clienteA = ClienteEntity.create({
      nombre: 'ACME',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_acme',
      activo: true,
    });
    const clienteRepo = {
      findAll: vi.fn<IClienteRepository['findAll']>().mockResolvedValue([clienteA]),
    };
    const emailConfigRepo = buildEmailConfigRepoMock({ configurado: false, verificadoAt: null });
    const useCase = new ListarClientesUseCase(clienteRepo, emailConfigRepo);

    const result = await useCase.execute();

    const [{ correo }] = result.getValue();
    expect(Object.keys(correo)).toEqual(['configurado', 'verificadoAt']);
  });
});
