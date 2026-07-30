import { DomainEvent } from '../../../shared/domain/domain-event';

/** Nombre del evento — topic usado por EventEmitter2. */
export const CONFIGURACION_CAMBIADA = 'configuracion.cambiada';

/**
 * ConfigScope — distingue si el cambio de config ocurrió en la DB de un
 * tenant o en master (`getMasterClient()`, config global — F2, solo
 * `isGlobalAdmin`). El `AuditLogPort` usa este mismo shape para elegir la DB
 * donde persistir el `AuditEntry` (R5 "scope dual" — nunca cruzado).
 *
 * El scope tenant lleva `clienteId` (NO `dbName` crudo — Judgment Day PR3
 * Ronda 1, issue 3 — real confirmado A+B): confiar en un `dbName` que viaja
 * desde el caller es la misma clase de bug que R9 ya cerró en
 * `PrismaConfigResolver` — un evento construido con datos incorrectos (bug,
 * tampering, o simplemente un caller mal escrito) podría apuntar a la DB de
 * OTRO tenant. `PrismaAuditLog.record()` re-resuelve el `dbName` real desde
 * `master.clientes` por `clienteId` (mismo patrón que
 * `PrismaConfigResolver.findTenantRows()`) antes de escribir — nunca confía
 * en un `dbName` ajeno a esa resolución.
 */
export type ConfigScope = { kind: 'tenant'; clienteId: string } | { kind: 'global' };

/**
 * ConfiguracionCambiada — evento de dominio publicado por
 * `ActualizarConfigUseCase` (PR4) tras persistir un cambio en
 * `ConfiguracionRuntime`.
 *
 * `valorAnterior`/`valorNuevo` viajan YA ENMASCARADOS si `esSecreto` (Dz7 —
 * REQUISITO DURO, STATE.md "Judgment Day — PR1 — fixes Ronda 2" fix #6): el
 * cleartext NUNCA entra a este evento — se enmascara en el ORIGEN (write
 * use case, vía `maskIfSecret()`) antes de construir la instancia. Esta
 * entidad de evento NO enmascara nada por sí misma; es un transporte plano.
 *
 * Ref design: §5 (firma exacta), §2 Dz7. Ref spec: R5. Tarea: 3.4 (PR3).
 */
export class ConfiguracionCambiada implements DomainEvent {
  readonly eventName = CONFIGURACION_CAMBIADA;

  constructor(
    readonly scope: ConfigScope,
    readonly actorId: string,
    readonly categoria: string,
    readonly clave: string,
    readonly valorAnterior: string | null, // YA enmascarado si esSecreto (Dz7)
    readonly valorNuevo: string | null, // YA enmascarado si esSecreto (Dz7)
    readonly esSecreto: boolean,
    readonly occurredAt: Date,
  ) {}
}
