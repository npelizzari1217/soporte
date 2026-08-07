import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * Comando de entrada de `EditarClienteUseCase`. `clienteId` identifica el
 * tenant a editar; el resto son campos comerciales opcionales (patch parcial:
 * `undefined` = "no tocar"). dbName NO se acepta — es inmutable (identifica la
 * DB física).
 */
export interface EditarClienteCommand {
  clienteId: string;
  nombre?: string;
  razonSocial?: string | null;
  cuit?: string | null;
}

/**
 * EditarClienteUseCase — edita los datos comerciales de un cliente (tenant).
 *
 * ABM de clientes exclusivo de ROOT (gateado por `GlobalAdminGuard` a nivel de
 * `ClientesController`). No revalida el actor porque la edición no dispara
 * provisioning físico (a diferencia de `CrearClienteUseCase`); la única
 * defensa necesaria es la existencia del cliente.
 *
 * 1. `findById` → `null` = `ClienteNoEncontradoError`.
 * 2. Aplica los cambios provistos en la entidad y persiste (upsert).
 */
export class EditarClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(
    command: EditarClienteCommand,
  ): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    cliente.editar({
      nombre: command.nombre,
      razonSocial: command.razonSocial,
      cuit: command.cuit,
    });
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
