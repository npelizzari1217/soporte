import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { AuthModule } from './auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import { TAREAS_SEGUNDO_PLANO } from '../shared/domain/ports/i-tareas-segundo-plano.port';
import { TareasSegundoPlano } from '../shared/infrastructure/segundo-plano/tareas-segundo-plano';
import { RecuperacionPasswordThrottlerGuard } from './infrastructure/guards/recuperacion-password-throttler.guard';
import { EMAIL_SENDER, IEmailSender } from '../shared/domain/ports/i-email-sender';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { entorno } from '../config/entorno';

import { USUARIO_REPOSITORY, IUsuarioRepository } from './domain/ports/i-usuario.repository';
import { MEMBRESIA_REPOSITORY, IMembresiaRepository } from './domain/ports/i-membresia.repository';
import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../clientes/domain/ports/i-cliente.repository';
import {
  CLIENTE_EMAIL_CONFIG_REPOSITORY,
  IClienteEmailConfigRepository,
} from '../clientes/domain/ports/i-cliente-email-config.repository';
import { PrismaClienteEmailConfigRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente-email-config.repository';
import {
  PASSWORD_RESET_TOKEN_REPOSITORY,
  IPasswordResetTokenRepository,
} from './domain/ports/i-password-reset-token.repository';
import { PrismaPasswordResetTokenRepository } from './infrastructure/persistence/prisma/prisma-password-reset-token.repository';
import { CORREO_DE_CLIENTE, ICorreoDeCliente } from './domain/ports/i-correo-de-cliente.port';
import { CorreoDeClienteAdapter } from './infrastructure/email/correo-de-cliente.adapter';
import { SolicitarResetPasswordUseCase } from './application/use-cases/solicitar-reset-password.use-case';

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
 * Alcance de WU-5b (tarea 5.4, split de WU-5): wirea `CORREO_DE_CLIENTE` →
 * `CorreoDeClienteAdapter` (ADR-4), `PASSWORD_RESET_TOKEN_REPOSITORY` →
 * `PrismaPasswordResetTokenRepository` (ADR-5/ADR-6) y
 * `SolicitarResetPasswordUseCase`, con `appBaseUrl` desde
 * `entorno.APP_BASE_URL` (ADR-7 — `application/` no lee `process.env`).
 * `CLIENTE_EMAIL_CONFIG_REPOSITORY` se provee LOCAL, igual que en
 * `notificaciones.module.ts:65-68` (ver el comment de `SharedModule` sobre
 * por qué NUNCA va ahí). `USUARIO_REPOSITORY`, `MEMBRESIA_REPOSITORY` y
 * `CLIENTE_REPOSITORY` se reusan de `AuthModule` (ya exportados); `EMAIL_SENDER`
 * se reusa de `NotificacionesModule` (ya exportado) — ninguno se duplica acá.
 *
 * Imports: `AuthModule` (usuarios/refresh tokens) y `NotificacionesModule`
 * (`EMAIL_SENDER`) — mismo motivo que `CsatModule` (`csat.module.ts:80-84`):
 * `NotificacionesModule` importa `TicketsModule`, que importa `AuthModule`,
 * así que importar `NotificacionesModule` desde `AuthModule` cerraría un
 * ciclo.
 *
 * Ref design: ADR-1, ADR-2, ADR-3, ADR-4, ADR-5, ADR-6, ADR-7. Tarea: 4.6, 5.4.
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

    // ─── WU-5b: CLIENTE_EMAIL_CONFIG_REPOSITORY local (ADR-4) ───────────────
    // Local, NO reusado de otro módulo — ver el comment de `SharedModule`
    // sobre `TENANT_ENUMERATOR`: un token de alcance módulo registrado dos
    // veces (acá y en `NotificacionesModule`) no falla al compilar, crea una
    // segunda instancia en silencio. Este adaptador solo lee estado, así que
    // dos instancias son inofensivas — mismo criterio que
    // `notificaciones.module.ts:65-68`.
    {
      provide: CLIENTE_EMAIL_CONFIG_REPOSITORY,
      useClass: PrismaClienteEmailConfigRepository,
    },

    // ─── WU-5b: ICorreoDeCliente → CorreoDeClienteAdapter (ADR-4) ───────────
    {
      provide: CORREO_DE_CLIENTE,
      useFactory: (
        clienteRepo: IClienteRepository,
        emailConfigRepo: IClienteEmailConfigRepository,
        prismaService: PrismaService,
        tenantContext: TenantContext,
        emailSender: IEmailSender,
      ) =>
        new CorreoDeClienteAdapter(
          clienteRepo,
          emailConfigRepo,
          prismaService,
          tenantContext,
          emailSender,
        ),
      inject: [
        CLIENTE_REPOSITORY,
        CLIENTE_EMAIL_CONFIG_REPOSITORY,
        PrismaService,
        TenantContext,
        EMAIL_SENDER,
      ],
    },

    // ─── WU-5b: IPasswordResetTokenRepository → PrismaPasswordResetTokenRepository (ADR-5/ADR-6) ─
    { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useClass: PrismaPasswordResetTokenRepository },

    // ─── WU-5b: SolicitarResetPasswordUseCase (tarea 5.4) ───────────────────
    // `appBaseUrl` sale de `entorno.APP_BASE_URL` acá, en el factory —
    // `application/` no lee `process.env` (ADR-7).
    {
      provide: SolicitarResetPasswordUseCase,
      useFactory: (
        usuarioRepo: IUsuarioRepository,
        membresiaRepo: IMembresiaRepository,
        tokenRepo: IPasswordResetTokenRepository,
        correoDeCliente: ICorreoDeCliente,
        logger: ILogger,
      ) =>
        new SolicitarResetPasswordUseCase(
          usuarioRepo,
          membresiaRepo,
          tokenRepo,
          correoDeCliente,
          logger,
          entorno.APP_BASE_URL,
        ),
      inject: [
        USUARIO_REPOSITORY,
        MEMBRESIA_REPOSITORY,
        PASSWORD_RESET_TOKEN_REPOSITORY,
        CORREO_DE_CLIENTE,
        LOGGER,
      ],
    },
  ],
})
export class RecuperacionPasswordModule {}
