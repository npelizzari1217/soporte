import { Result } from '../../../shared/domain/result';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNotFoundError } from '../../domain/errors/clientes.errors';

/**
 * ReactivarClienteUseCase — reactiva un cliente previamente suspendido.
 *
 * Efectos:
 * - Setea activo=true en el cliente.
 * - Limpia deletedAt (null → el cliente vuelve a estar "vivo").
 *
 * Retorna:
 *   - Result.ok(undefined) si la reactivación fue exitosa.
 *   - Result.fail(ClienteNotFoundError) si el cliente no existe.
 *
 * Tarea: 1.B.4
 */
export class ReactivarClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(id: string): Promise<Result<void, ClienteNotFoundError>> {
    const cliente = await this.clienteRepo.findById(id);
    if (!cliente) {
      return Result.fail(new ClienteNotFoundError(id));
    }

    cliente.reactivate();
    await this.clienteRepo.save(cliente);

    return Result.ok(undefined);
  }
}
