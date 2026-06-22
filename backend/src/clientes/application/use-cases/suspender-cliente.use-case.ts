import { Result } from '../../../shared/domain/result';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNotFoundError } from '../../domain/errors/clientes.errors';

/**
 * SuspenderClienteUseCase — suspende un cliente activo.
 *
 * Efectos:
 * - Setea activo=false en el cliente.
 * - Realiza soft delete (deletedAt = now()).
 * - La DB tenant del cliente NO se dropea — permanece intacta.
 *   El drop es una operación explícita y manual (no se automatiza en PR-04).
 *
 * Retorna:
 *   - Result.ok(undefined) si la suspensión fue exitosa.
 *   - Result.fail(ClienteNotFoundError) si el cliente no existe.
 *
 * Tarea: 1.B.4
 */
export class SuspenderClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(id: string): Promise<Result<void, ClienteNotFoundError>> {
    const cliente = await this.clienteRepo.findById(id);
    if (!cliente) {
      return Result.fail(new ClienteNotFoundError(id));
    }

    cliente.suspend();
    await this.clienteRepo.save(cliente);

    return Result.ok(undefined);
  }
}
