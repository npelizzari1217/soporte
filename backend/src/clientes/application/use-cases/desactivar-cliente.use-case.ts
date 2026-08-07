import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * DesactivarClienteUseCase — baja LÓGICA de un cliente (tenant).
 *
 * `suspend()` setea `activo=false` + soft delete. La DB física del tenant NO
 * se dropea — la baja es reversible vía `ReactivarClienteUseCase`. Exclusivo
 * ROOT (`GlobalAdminGuard` en `ClientesController`).
 *
 * 1. `findById` → `null` = `ClienteNoEncontradoError`.
 * 2. `suspend()` + `save()`.
 */
export class DesactivarClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(clienteId: string): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    cliente.suspend();
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
