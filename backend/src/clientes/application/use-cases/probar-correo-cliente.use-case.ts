/**
 * ProbarCorreoClienteUseCase — dispara un handshake SMTP bajo demanda
 * ("Probar conexión") SIN modificar la config guardada, salvo el resultado
 * de la propia verificación (D6).
 *
 * A diferencia de `ConfigurarCorreoClienteUseCase`, este caso de uso NO
 * escribe host/port/user/secure/from/password — solo lee la config actual
 * (ya descifrada por el adaptador vía `findForSend`) y persiste el
 * `VerificacionOutcome` saneado.
 *
 * Ref spec: sdd/configuracion-correo-por-cliente/spec — "Handshake succeeds",
 *   "Handshake fails but save persists" (mismo saneamiento aplica al botón
 *   manual).
 * Ref design: sdd/configuracion-correo-por-cliente D6.
 * Ref tasks: WU4 4.4.
 */
import { Result } from '../../../shared/domain/result';
import { IClienteRepository } from '../../domain/ports/i-cliente.repository';
import {
  ClienteEmailConfigState,
  IClienteEmailConfigRepository,
} from '../../domain/ports/i-cliente-email-config.repository';
import { IEmailConnectionVerifier } from '../../../shared/domain/ports/i-email-connection-verifier.port';
import {
  ClienteNoEncontradoError,
  CorreoNoConfiguradoError,
} from '../../domain/errors/clientes.errors';

export type ProbarCorreoClienteError = ClienteNoEncontradoError | CorreoNoConfiguradoError;

export class ProbarCorreoClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly emailConfigRepo: IClienteEmailConfigRepository,
    private readonly connectionVerifier: IEmailConnectionVerifier,
  ) {}

  async execute(
    clienteId: string,
  ): Promise<Result<ClienteEmailConfigState, ProbarCorreoClienteError>> {
    const cliente = await this.clienteRepo.findById(clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(clienteId));
    }

    const configActual = await this.emailConfigRepo.findForSend(clienteId);
    if (!configActual) {
      return Result.fail(new CorreoNoConfiguradoError());
    }

    const outcome = await this.connectionVerifier.verify({
      host: configActual.host,
      port: configActual.port,
      user: configActual.user,
      password: configActual.password,
      secure: configActual.secure,
    });
    await this.emailConfigRepo.saveVerificationOutcome(clienteId, outcome);

    return Result.ok(await this.emailConfigRepo.findState(clienteId));
  }
}
