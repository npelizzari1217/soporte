/**
 * ConfigurarCorreoClienteUseCase — guarda (alta o edición) la configuración
 * SMTP de un cliente, la verifica, y persiste el resultado de la
 * verificación en una segunda escritura (D6, D7).
 *
 * DESVIACIÓN DELIBERADA DEL DESIGN (ver mem #2366, WU3): este use case NO
 * inyecta `ISecretCipher`. Solo `IClienteEmailConfigRepository` — el cifrado
 * vive en el borde de persistencia (`PrismaClienteEmailConfigRepository`).
 * Esto también aplica al caso "falta `EMAIL_CRYPTO_KEY`" (D2): el use case
 * NO llama a `isAvailable()` porque no tiene el cipher. En cambio, deja que
 * `save()` haga su trabajo — el adaptador cifra ANTES de escribir en la
 * base, así que si la clave falta, `save()` lanza (nunca persiste nada) y
 * este use case traduce esa excepción puntual a `EmailCryptoKeyAusenteError`.
 *
 * Flujo:
 * 1. El cliente debe existir (`ClienteNoEncontradoError`, 404).
 * 2. Password:
 *    - provisto → se usa tal cual (rotación, D7 "Password rotated by ROOT").
 *    - omitido (`undefined`) + cliente YA configurado → se recupera el
 *      plaintext actual vía `findForSend()` y se re-envía sin cambios
 *      (preserva el ciphertext — D7 "omitted password preserves ciphertext").
 *      El plaintext recuperado nunca sale de esta función: se usa en memoria
 *      para el `save()` inmediato y para el `verify()` de abajo.
 *    - omitido + cliente NO configurado → `CorreoPasswordFaltanteError` (400,
 *      "nada que preservar").
 * 3. `save()` — todo-o-nada (D1/D4 CHECK en la base). Si falla por falta de
 *    `EMAIL_CRYPTO_KEY`, no se guardó nada (ver nota arriba) → 503.
 * 4. `verify()` — un handshake fallido NO revierte el save (D6/#2361-4): se
 *    persiste el resultado saneado en una segunda escritura
 *    (`saveVerificationOutcome`) y se retorna el estado final.
 *
 * Ref spec: sdd/configuracion-correo-por-cliente/spec — "All-or-nothing SMTP
 *   configuration", "Omitted password preserves existing credential",
 *   "New password replaces ciphertext", "Connection verification does not
 *   block save".
 * Ref design: sdd/configuracion-correo-por-cliente D2, D6, D7.
 * Ref tasks: WU4 4.2.
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
  CorreoPasswordFaltanteError,
  EmailCryptoKeyAusenteError,
} from '../../domain/errors/clientes.errors';

/** Marcador del mensaje que `AesGcmSecretCipher` lanza cuando falta la clave (D2). */
const EMAIL_CRYPTO_KEY_ERROR_MARKER = 'EMAIL_CRYPTO_KEY';

export interface ConfigurarCorreoClienteCommand {
  clienteId: string;
  host: string;
  port: number;
  user: string;
  secure: boolean;
  from: string;
  /** `undefined` = "no tocar la contraseña existente" (D7). */
  password?: string;
}

export type ConfigurarCorreoClienteError =
  ClienteNoEncontradoError | CorreoPasswordFaltanteError | EmailCryptoKeyAusenteError;

export class ConfigurarCorreoClienteUseCase {
  constructor(
    private readonly clienteRepo: IClienteRepository,
    private readonly emailConfigRepo: IClienteEmailConfigRepository,
    private readonly connectionVerifier: IEmailConnectionVerifier,
  ) {}

  async execute(
    command: ConfigurarCorreoClienteCommand,
  ): Promise<Result<ClienteEmailConfigState, ConfigurarCorreoClienteError>> {
    const cliente = await this.clienteRepo.findById(command.clienteId);
    if (!cliente) {
      return Result.fail(new ClienteNoEncontradoError(command.clienteId));
    }

    // 2. Resolver la contraseña a persistir — ver docblock.
    let password = command.password;
    if (password === undefined) {
      const configActual = await this.emailConfigRepo.findForSend(command.clienteId);
      if (!configActual) {
        return Result.fail(new CorreoPasswordFaltanteError());
      }
      password = configActual.password;
    }

    // 3. Guardar todo-o-nada. Si falta EMAIL_CRYPTO_KEY, el adaptador cifra
    // ANTES de escribir y lanza sin tocar la base (D2) — se traduce acá.
    try {
      await this.emailConfigRepo.save(command.clienteId, {
        host: command.host,
        port: command.port,
        user: command.user,
        secure: command.secure,
        from: command.from,
        password,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes(EMAIL_CRYPTO_KEY_ERROR_MARKER)) {
        return Result.fail(new EmailCryptoKeyAusenteError());
      }
      throw error;
    }

    // 4. Verificar sin bloquear el save (D6/#2361-4) y persistir el motivo saneado.
    const outcome = await this.connectionVerifier.verify({
      host: command.host,
      port: command.port,
      user: command.user,
      password,
      secure: command.secure,
    });
    await this.emailConfigRepo.saveVerificationOutcome(command.clienteId, outcome);

    return Result.ok(await this.emailConfigRepo.findState(command.clienteId));
  }
}
