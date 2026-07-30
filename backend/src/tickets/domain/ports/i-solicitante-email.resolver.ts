import { Result } from '../../../shared/domain/result';
import { Email } from '../value-objects/email.vo';
import { ResolverEmailError } from '../errors/email.errors';

/** Token de inyección de dependencias para ISolicitanteEmailResolver en NestJS. */
export const SOLICITANTE_EMAIL_RESOLVER = Symbol('SOLICITANTE_EMAIL_RESOLVER');

/**
 * ISolicitanteEmailResolver — resuelve el email del solicitante de un ticket
 * consultando `master.Usuario` cross-DB (mismo patrón de acceso que
 * `IUsuarioMasterChecker`: vía `PrismaService.getMasterClient()`, SIN
 * `TenantContext`, scoped por `clienteId` explícito — el listener async que
 * lo invoca puede correr fuera del ciclo request/response donde vivía el
 * TenantContext original).
 *
 * Ref spec: Requirement 8.
 * Ref design: §5.
 * Tarea: 2.6 (PR2, notif-email-estado-ticket)
 */
export interface ISolicitanteEmailResolver {
  /**
   * @param solicitanteId soft-ref UUID → master.Usuario.id
   * @param clienteId UUID del tenant del ticket — el resolver NUNCA filtra
   *                  emails de un tenant ajeno (aislamiento multi-tenant,
   *                  mismo principio que existeEnTenant/estaActivoEnTenant).
   */
  resolver(solicitanteId: string, clienteId: string): Promise<Result<Email, ResolverEmailError>>;
}
