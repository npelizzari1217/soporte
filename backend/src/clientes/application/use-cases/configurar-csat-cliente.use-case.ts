import { Result } from '../../../shared/domain/result';
import { ClienteEntity } from '../../domain/entities/cliente.entity';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

/**
 * Comando de entrada de `ConfigurarCsatClienteUseCase`.
 */
export interface ConfigurarCsatClienteCommand {
  clienteId: string;
  habilitado: boolean;
}

/**
 * ConfigurarCsatClienteUseCase — prende/apaga la emisión de encuestas CSAT
 * de un cliente (sdd/csat, WU10.2). Ruta SEPARADA de la edición comercial
 * (`EditarClienteUseCase`), mismo criterio que la configuración de correo
 * (D7): un flag de configuración no comparte el patch parcial de los datos
 * comerciales.
 *
 * ABM de clientes exclusivo de ROOT (gateado por `GlobalAdminGuard` a nivel
 * de `ClientesController`).
 *
 * 1. `findById` → `null` = `ClienteNoEncontradoError`.
 * 2. Aplica el flag en la entidad y persiste (upsert).
 */
export class ConfigurarCsatClienteUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async execute(
    command: ConfigurarCsatClienteCommand,
  ): Promise<Result<ClienteEntity, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    cliente.configurarCsat(command.habilitado);
    await this.clienteRepo.save(cliente);
    return Result.ok(cliente);
  }
}
