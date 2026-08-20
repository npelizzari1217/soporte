/**
 * VerCorreoClienteUseCase — lectura de la configuración de correo de UN
 * cliente (`GET /clientes/:id/correo`). Cierra el hueco señalado en
 * mem #2365/#2364: sin esto, el frontend no puede prellenar el diálogo de
 * edición sin hacer un PATCH primero.
 *
 * SOLO LECTURA: llama a `findState()`, nunca a `save()`/`saveVerificationOutcome()`.
 * Esto importa porque `save()` toca `smtp_config_updated_at` (la revisión de
 * caché de transporters de WU5, D3) — si una simple lectura la tocara,
 * invalidaría un transporter válido en cada `GET`.
 *
 * NO inyecta `ISecretCipher` (#2366) — mismo criterio que el resto de WU4.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D7.
 * Ref tasks: WU4 (cierre de hueco post-apply, ver mem #2364).
 */
import { Result } from '../../../shared/domain/result';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteEmailConfigState,
  IClienteEmailConfigRepository,
} from '../../domain/ports/i-cliente-email-config.repository';
import { ClienteNoEncontradoError } from '../../domain/errors/clientes.errors';

export class VerCorreoClienteUseCase {
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

    return Result.ok(await this.emailConfigRepo.findState(clienteId));
  }
}
