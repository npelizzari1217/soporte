import { describe, it, expect, vi } from 'vitest';
import { ListarClientesUseCase } from './listar-clientes.use-case';
import { ClienteEntity } from '../../domain/entities/cliente.entity';

describe('ListarClientesUseCase (G3, sdd/beta-frontend — ROOT)', () => {
  it('retorna todos los clientes (el controller ya restringe a ROOT vía GlobalAdminGuard)', async () => {
    const clienteA = ClienteEntity.create({
      nombre: 'ACME',
      razonSocial: null,
      cuit: null,
      dbName: 'soporte_acme',
      activo: true,
    });
    const clienteRepo = { findAll: vi.fn().mockResolvedValue([clienteA]) };
    const useCase = new ListarClientesUseCase(clienteRepo as never);

    const result = await useCase.execute();

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([clienteA]);
    expect(clienteRepo.findAll).toHaveBeenCalledOnce();
  });
});
