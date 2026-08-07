/**
 * NestLoggerAdapter — implementación de `ILogger` sobre el `Logger` de
 * `@nestjs/common`. Único punto donde `application/` toca (indirectamente,
 * vía el puerto) el framework de logging de NestJS.
 *
 * Registrado `@Global()` en `SharedModule` bajo el token `LOGGER` — ver
 * `shared/domain/ports/i-logger.port.ts`.
 *
 * Tarea: T6.6 (PR6 — Guards + AuthController + AuthModule), primer consumidor
 * real: `SwitchTenantUseCase` (R10).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ILogger } from '../../domain/ports/i-logger.port';

@Injectable()
export class NestLoggerAdapter implements ILogger {
  private readonly logger = new Logger('App');

  log(message: string): void {
    this.logger.log(message);
  }
}
