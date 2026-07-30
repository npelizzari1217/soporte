import { Injectable, Logger } from '@nestjs/common';
import { ILogger } from '../../domain/ports/i-logger.port';

/**
 * NestLoggerAdapter — implementación de ILogger sobre el Logger de
 * `@nestjs/common` (MVP, in-process — sin proveedor externo tipo
 * Sentry/Datadog).
 *
 * ÚNICO lugar del repo que importa `Logger` de `@nestjs/common` en nombre de
 * `application/` — el resto de la app depende del puerto `ILogger`, nunca
 * del framework directo (clean-arch/SKILL.md, dependency rule).
 *
 * Contexto fijo `'Application'`: este adapter es un singleton global
 * (`@Global()` en `SharedModule`) compartido por todos los use cases que
 * inyecten `LOGGER` — no hay un contexto por-clase como el patrón previo
 * (`new Logger(MiUseCase.name)` local a cada use case, eliminado en
 * Judgment Day PR4 Ronda 2). Los mensajes logueados por los use cases ya
 * incluyen el identificador relevante (ej. `ticketId`) en el propio texto,
 * así que la pérdida del contexto por-clase no reduce la trazabilidad real.
 *
 * Ref design: puerto en `shared/domain/ports/i-logger.port.ts`.
 * Ref: Judgment Day PR4 Ronda 2 (WARNING confirmado 2 jueces).
 */
@Injectable()
export class NestLoggerAdapter implements ILogger {
  private readonly logger = new Logger('Application');

  error(message: string, stack?: string): void {
    this.logger.error(message, stack);
  }
}
