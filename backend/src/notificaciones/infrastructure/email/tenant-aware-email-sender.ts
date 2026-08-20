import { EmailMessage, IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import {
  ClienteEmailConfigForSend,
  IClienteEmailConfigRepository,
} from '../../../clientes/domain/ports/i-cliente-email-config.repository';
import { SmtpEmailSender, SmtpConfig } from './smtp-email-sender';

/**
 * Construye el `IEmailSender` concreto para una config ya resuelta.
 * Parámetro de constructor (con default a `SmtpEmailSender`) para poder
 * testear `TenantAwareEmailSender` sin nodemailer real (WU5, 5.5).
 */
export type SmtpEmailSenderFactory = (
  config: SmtpConfig,
  logger: Pick<ILogger, 'log'>,
) => IEmailSender;

const defaultSenderFactory: SmtpEmailSenderFactory = (config, logger) =>
  new SmtpEmailSender(config, logger);

/**
 * TenantAwareEmailSender — implementación de `IEmailSender` que resuelve la
 * identidad SMTP del CLIENTE ACTIVO en cada `send()`, en vez de un único
 * transporter construido una vez al arrancar (D3).
 *
 * `IEmailSender` no cambia — reemplaza el binding de `EMAIL_SENDER` en
 * `notificaciones.module.ts` y ningún listener se toca.
 *
 * Flujo (D3, verificado que los listeners corren dentro del scope ALS —
 * ADR-P8):
 *   1. `TenantContext.get()?.clienteId` — sin contexto, no hay a quién
 *      resolverle la config: degrada explícito, razón `EMAIL_SIN_TENANT_CONTEXT`.
 *   2. `IClienteEmailConfigRepository.findForSend(clienteId)` — YA devuelve
 *      la contraseña descifrada (el cifrado vive en el adaptador de
 *      persistencia, desviación de WU3 documentada en mem #2366; este sender
 *      nunca importa `ISecretCipher`). Si el descifrado falla (típicamente
 *      `EMAIL_CRYPTO_KEY` ausente o inválida, D2) el repositorio LANZA —
 *      se atrapa acá y degrada con razón `EMAIL_CRYPTO_KEY_AUSENTE`.
 *   3. Sin config (`null`) — cliente que todavía no cargó sus datos: caso
 *      ESPERADO y benigno, razón `EMAIL_CLIENTE_SIN_CONFIG`.
 *   4. Con config: transporter cacheado por `${clienteId}:${configRevision}`
 *      (D3) — `configRevision` es `smtp_config_updated_at`, así que cuando
 *      la config cambia la CLAVE cambia y la entrada vieja queda
 *      inalcanzable por construcción (no hay TTL ni invalidación explícita
 *      que recordar). Las entradas superadas del mismo cliente se
 *      descartan del Map — el `SmtpEmailSender` subyacente NO usa
 *      `pool: true` (ver smtp-email-sender.ts), así que no mantiene sockets
 *      vivos entre envíos y no hay `transporter.close()` que llamar sin
 *      modificar esa clase (fuera de alcance del design, que la deja
 *      explícitamente sin tocar).
 *
 * CRÍTICO (spec): las tres razones de degradación son literales DISTINTOS
 * en el log — "sin tenant context" (posible bug propio, hay que
 * investigarlo) nunca se confunde con "cliente sin configurar" (esperado,
 * benigno) ni con "clave de cifrado ausente" (config de entorno).
 *
 * Ref design: sdd/configuracion-correo-por-cliente D2, D3.
 * Ref tasks: WU5 5.3, 5.4, 5.5.
 */
export class TenantAwareEmailSender implements IEmailSender {
  private readonly cache = new Map<string, IEmailSender>();

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly emailConfigRepo: IClienteEmailConfigRepository,
    private readonly logger: Pick<ILogger, 'log'>,
    private readonly createSender: SmtpEmailSenderFactory = defaultSenderFactory,
  ) {}

  async send(msg: EmailMessage): Promise<void> {
    const clienteId = this.tenantContext.get()?.clienteId;

    if (!clienteId) {
      this.logger.log(
        'EMAIL_SIN_TENANT_CONTEXT | no hay TenantContext activo — no se pudo determinar de qué cliente se trata',
      );
      return;
    }

    let config: ClienteEmailConfigForSend | null;
    try {
      config = await this.emailConfigRepo.findForSend(clienteId);
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'error desconocido';
      this.logger.log(
        `EMAIL_CRYPTO_KEY_AUSENTE | clienteId=${clienteId} | no se pudo descifrar la config — error=${mensaje}`,
      );
      return;
    }

    if (!config) {
      this.logger.log(
        `EMAIL_CLIENTE_SIN_CONFIG | clienteId=${clienteId} | el cliente todavia no tiene correo configurado`,
      );
      return;
    }

    const sender = this.resolveSender(clienteId, config);
    await sender.send(msg);
  }

  /** Get-or-build del transporter cacheado, con eviccion de revisiones viejas del mismo cliente (D3). */
  private resolveSender(clienteId: string, config: ClienteEmailConfigForSend): IEmailSender {
    const cacheKey = `${clienteId}:${config.configRevision}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const prefix = `${clienteId}:`;
    for (const existingKey of this.cache.keys()) {
      if (existingKey.startsWith(prefix)) {
        this.cache.delete(existingKey);
      }
    }

    const sender = this.createSender(
      {
        host: config.host,
        port: config.port,
        user: config.user,
        pass: config.password,
        from: config.from,
        secure: config.secure,
      },
      this.logger,
    );
    this.cache.set(cacheKey, sender);
    return sender;
  }
}
