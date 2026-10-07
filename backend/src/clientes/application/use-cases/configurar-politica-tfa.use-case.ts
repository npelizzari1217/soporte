import { Result } from '../../../shared/domain/result';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

export interface PoliticaTfaCliente {
  requiere2fa: boolean;
}

/**
 * Lee y fija la politica de 2FA del cliente del actor (`requiere_2fa`).
 *
 * El `clienteId` lo pone el controlador desde `actor.cliente_id`, nunca desde el body. La
 * escritura es un UPDATE dirigido (`fijarRequiere2fa`), no pasa por `save`. Fijarla NO toca
 * sesiones (C4) ni el 2FA de nadie (C5): no depende de auth ni de los repositorios de 2FA.
 */
export class ConfigurarPoliticaTfaUseCase {
  constructor(private readonly clienteRepo: IClienteRepository) {}

  async obtener(clienteId: string): Promise<Result<PoliticaTfaCliente, ClienteNoEncontradoError>> {
    const requiere2fa = await this.clienteRepo.obtenerRequiere2fa(clienteId);
    if (requiere2fa === null) return Result.fail(new ClienteNoEncontradoError(clienteId));
    return Result.ok({ requiere2fa });
  }

  async execute(command: {
    clienteId: string;
    requiere2fa: boolean;
  }): Promise<Result<PoliticaTfaCliente, ClienteNoEncontradoError>> {
    const existe = await this.clienteRepo.fijarRequiere2fa(command.clienteId, command.requiere2fa);
    if (!existe) return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    return Result.ok({ requiere2fa: command.requiere2fa });
  }
}
