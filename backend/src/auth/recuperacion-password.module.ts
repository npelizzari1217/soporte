import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AuthModule } from './auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import { TAREAS_SEGUNDO_PLANO } from '../shared/domain/ports/i-tareas-segundo-plano.port';
import { TareasSegundoPlano } from '../shared/infrastructure/segundo-plano/tareas-segundo-plano';
import { RecuperacionPasswordThrottlerGuard } from './infrastructure/guards/recuperacion-password-throttler.guard';

/**
 * RecuperacionPasswordModule — reseteo de contraseña por olvido,
 * self-service (ADR-1 del design).
 *
 * **NO se registra en `app.module.ts` hasta WU-11** (exposición gradual,
 * ver "Migration / Rollout" del design): hasta entonces el módulo existe y
 * se prueba vía harness propios (`TestHarnessModule`, molde
 * `csat.e2e.spec.ts:91`), pero `main` no monta ninguna ruta nueva.
 *
 * Alcance de WU-4: `TAREAS_SEGUNDO_PLANO` (ADR-2) y el throttler guard
 * (ADR-3), con su propia `ThrottlerStorageService` en vez de un segundo
 * `ThrottlerModule.forRoot()` — ver `RecuperacionPasswordThrottlerGuard`.
 * `RecuperacionPasswordController` (WU-7/WU-8) se suma después a
 * `controllers`.
 *
 * Imports: `AuthModule` (usuarios/refresh tokens) y `NotificacionesModule`
 * (`EMAIL_SENDER`) — mismo motivo que `CsatModule` (`csat.module.ts:80-84`):
 * `NotificacionesModule` importa `TicketsModule`, que importa `AuthModule`,
 * así que importar `NotificacionesModule` desde `AuthModule` cerraría un
 * ciclo.
 *
 * Ref design: ADR-1, ADR-2, ADR-3. Tarea: 4.6.
 */
@Module({
  imports: [AuthModule, NotificacionesModule],
  controllers: [],
  providers: [
    {
      provide: TAREAS_SEGUNDO_PLANO,
      useFactory: (logger: ILogger) => new TareasSegundoPlano(logger),
      inject: [LOGGER],
    },
    // Provider por `useFactory` con `ThrottlerStorageService` propia (ADR-3):
    // ver el JSDoc de la clase para el motivo de NO usar `forRoot`. Los
    // límites reales se fijan por ruta con `@Throttle` en el controller.
    {
      provide: RecuperacionPasswordThrottlerGuard,
      useFactory: (reflector: Reflector) =>
        new RecuperacionPasswordThrottlerGuard(
          [{ name: 'default', limit: 5, ttl: 900_000 }],
          new ThrottlerStorageService(),
          reflector,
        ),
      inject: [Reflector],
    },
  ],
})
export class RecuperacionPasswordModule {}
