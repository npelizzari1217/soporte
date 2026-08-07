/**
 * ILogger — puerto fino de logging para consumidores de `application/` (y
 * cualquier capa que no deba importar `@nestjs/common` directamente).
 *
 * Interfaz mínima: `log()` para auditoría de eventos de negocio en el camino
 * de éxito (usado por `SwitchTenantUseCase` para auditar el salto de tenant,
 * R10 — formato `SWITCH TENANT | usuario=... | from=... | to=... | at=ISO`).
 * Se amplía con `error`/`warn` cuando un consumidor real los necesite — no
 * se agregan métodos especulativos (mismo criterio que soporte1).
 *
 * La implementación concreta (adapter sobre el `Logger` de `@nestjs/common`)
 * vive en infra y se wirea global en `shared.module.ts` (PR5/PR6).
 *
 * Tarea: PR4 (Refresh + logout + switch) — requerido por SwitchTenantUseCase.
 */
export interface ILogger {
  /**
   * Loguea un evento informativo/de auditoría (nivel `log`, no error). Usado
   * para dejar rastro de eventos de negocio significativos en el camino de
   * éxito (ej. switch de tenant — actor, origen, destino, timestamp).
   */
  log(message: string): void;
}

/** Token de inyección de dependencias para ILogger en NestJS. */
export const LOGGER = Symbol('LOGGER');
