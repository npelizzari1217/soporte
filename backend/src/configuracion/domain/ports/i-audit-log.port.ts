/**
 * AuditLogPort — puerto de persistencia del log de auditoría inmutable de
 * cambios de config.
 *
 * `record()` NUNCA lanza — cualquier fallo de infra se mapea a
 * `Result.fail(AuditError)`. El llamador (`AuditConfiguracionHandler`) NO
 * propaga ni revierte ese fallo (Dz10, R5 "fallo de audit no revierte"): el
 * audit es un side-effect fire-and-forget, no la operación principal.
 *
 * `scope` (mismo shape que `ConfigScope` del evento) decide la DB destino en
 * el adapter: `tenant` → `getTenantClient(dbName).auditEntry.create(...)`;
 * `global` → `getMasterClient().auditEntry.create(...)` (R5 "scope dual" —
 * nunca cruzado).
 *
 * Ref design: §5, §8. Ref spec: R5. Tarea: 3.5 (PR3).
 */
import { DomainError, Result } from '../../../shared/domain/result';
import { AuditEntry } from '../entities/audit-entry.entity';
import { ConfigScope } from '../events/configuracion-cambiada.event';

/** Token de inyección de dependencias para AuditLogPort en NestJS. */
export const AUDIT_LOG = Symbol('AUDIT_LOG');

/**
 * AuditError — fallo de infraestructura al persistir un `AuditEntry` (DB
 * caída, timeout, `clienteId`/`dbName` inválido). El `message` NUNCA
 * interpola `valorAnterior`/`valorNuevo` crudos (podrían contener texto de
 * negocio sensible aunque ya estén enmascarados si eran secretos) — mismo
 * criterio que `InfraConfigError`/`CifradoError`.
 */
export class AuditError extends DomainError {
  readonly code = 'AUDIT_WRITE_FAILED' as const;

  constructor(message: string) {
    super(message);
  }
}

export interface AuditLogPort {
  /**
   * Persiste `entry` en la DB del `scope` indicado. Falla ⇒
   * `Result.fail(AuditError)` — el listener/handler lo loguean, NO
   * propagan ni revierten el cambio de config ya comiteado (Dz10).
   */
  record(entry: AuditEntry, scope: ConfigScope): Promise<Result<void, AuditError>>;
}
