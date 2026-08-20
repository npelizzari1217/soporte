/**
 * QuitarCorreoClienteUseCase — remoción EXPLÍCITA de la configuración SMTP
 * de un cliente (D7). Único camino de borrado: un string vacío en el
 * `password` de `ConfigurarCorreoClienteUseCase` NUNCA borra (spec
 * "Empty password string is never deletion") — esta es la acción separada
 * que sí lo hace.
 *
 * Limpia las 9 columnas SMTP, incluida la metadata de verificación
 * (`IClienteEmailConfigRepository.clear`, WU3).
 *
 * Ref spec: sdd/configuracion-correo-por-cliente/spec — "Explicit removal
 *   clears configuration".
 * Ref design: sdd/configuracion-correo-por-cliente D7.
 * Ref tasks: WU4 4.3.
 */
import { Result } from '../../../shared/domain/result';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteEmailConfigState,
  IClienteEmailConfigRepository,
} from '../../domain/ports/i-cliente-email-config.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

export class QuitarCorreoClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly emailConfigRepo: IClienteEmailConfigRepository,
  ) {}

  async execute(
    clienteId: string,
  ): Promise<Result<ClienteEmailConfigState, ClienteNoEncontradoError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    await this.emailConfigRepo.clear(clienteId);

    return Result.ok(await this.emailConfigRepo.findState(clienteId));
  }
}
