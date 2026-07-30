/**
 * ILogger — puerto fino de logging para consumidores de `application/` (y
 * cualquier capa que no deba importar `@nestjs/common` directamente).
 *
 * Interfaz mínima: solo el método que los use cases actuales necesitan
 * (log-and-swallow de errores post-commit — ver `crear-observacion.use-case.ts`
 * y `transicionar-estado.use-case.ts`). Se amplía con `warn`/`log` cuando un
 * consumidor real los necesite — no se agregan métodos especulativos.
 *
 * Las implementaciones concretas viven en infra:
 *   - NestLoggerAdapter — adapter sobre el Logger de @nestjs/common (MVP).
 *
 * Ref design: mismo patrón que `ITenantTransactionRunner`/`IDomainEventPublisher`
 * (port en `shared/domain/ports/`, token Symbol, impl en infra/, wire global
 * en `shared.module.ts`).
 *
 * Ref: Judgment Day PR4 Ronda 2 (WARNING confirmado 2 jueces) — el fix de
 * Ronda 1 (guard post-commit) había agregado `new Logger()` de
 * `@nestjs/common` DIRECTO en `application/`, violando la dependency rule
 * de clean-arch/SKILL.md ("application/ imports domain/ ONLY", "no
 * infrastructure import in application code"). El precedente citado en la
 * nota de Ronda 1 ("mismo patrón que NotificarCambioEstadoListener") era
 * incorrecto: ese listener vive en `tickets/infrastructure/events/`, no en
 * `application/` — ahí un `new Logger()` directo SÍ es válido (infra puede
 * importar el framework). Se resuelve acá con este puerto.
 */
export interface ILogger {
  /**
   * Loguea un error. `stack`, si se provee, son los frames de la excepción
   * original — bajo riesgo de PII (no es texto libre de negocio), a
   * diferencia de `message`, que el caller DEBE enmascarar/sanear antes de
   * pasarlo (ver `maskEmailsInText` en `tickets/domain/mask-email-like.ts`).
   */
  error(message: string, stack?: string): void;
}

/** Token de inyección de dependencias para ILogger en NestJS. */
export const LOGGER = Symbol('LOGGER');
