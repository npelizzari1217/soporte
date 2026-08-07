import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * ReactivarClienteUseCase — revierte la baja lógica de un cliente (tenant).
 *
 * `reactivate()` setea `activo=true` + limpia `deletedAt`. Contraparte de
 * `DesactivarClienteUseCase`. Exclusivo ROOT (`GlobalAdminGuard` en
 * `ClientesController`).
 *
 * 1. `findById` → `null` = `ClienteNoEncontradoError`.
 * 2. `reactivate()` + `save()`.
 */
export class ReactivarClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(clienteId: string): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    cliente.reactivate();
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
