/**
 * IConfigResolver — puerto central de resolución de configuración runtime.
 *
 * Resuelve la config SMTP de un tenant con fallback a la config global de
 * master (merge por campo, Dz4), descifra los valores `esSecreto` vía
 * `ISecretCipher`, y arma un `SmtpConfig` (VO de `shared/`). NUNCA lanza —
 * siempre `Result`. NUNCA filtra el secreto en claro fuera del `SmtpConfig`
 * devuelto (que a su vez lo mantiene solo en memoria).
 *
 * Ref design: §5 (LA pieza central), §3.1 (flujo de resolución). Ref spec:
 * Requirement 1, Requirement 9 (aislamiento multi-tenant). Tarea: 2.4 (PR2).
 */
import { Result } from '../../../shared/domain/result';
import { SmtpConfig } from '../../../shared/domain/value-objects/smtp-config.vo';
import { ResolveConfigError } from '../errors/config.errors';

/** Token de inyección de dependencias para IConfigResolver en NestJS. */
export const CONFIG_RESOLVER = Symbol('CONFIG_RESOLVER');

export interface IConfigResolver {
  /**
   * Resuelve la `SmtpConfig` del tenant indicado por `clienteId`: merge por
   * campo tenant→global, descifra secretos, arma el VO. NUNCA lanza; nunca
   * filtra config de otro tenant (aislamiento cross-DB, Requirement 9).
   */
  resolveSmtp(clienteId: string): Promise<Result<SmtpConfig, ResolveConfigError>>;
}
