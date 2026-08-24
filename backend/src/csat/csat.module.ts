import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { CsatLecturaModule } from './csat-lectura.module';

import {
  CLIENTE_REPOSITORY,
  IClienteRepository,
} from '../clientes/domain/ports/i-cliente.repository';
import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';
import {
  USUARIO_CONTACTO_RESOLVER,
  IUsuarioContactoResolver,
} from '../notificaciones/domain/ports/i-usuario-contacto-resolver';
import { EMAIL_SENDER, IEmailSender } from '../shared/domain/ports/i-email-sender';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';

import {
  ENCUESTA_TOKEN_REPOSITORY,
  IEncuestaTokenRepository,
} from './domain/ports/i-encuesta-token.repository';
import {
  ENCUESTA_SATISFACCION_REPOSITORY,
  IEncuestaSatisfaccionRepository,
} from './domain/ports/i-encuesta-satisfaccion.repository';
import { PrismaEncuestaTokenRepository } from './infrastructure/persistence/prisma/prisma-encuesta-token.repository';

import { EmitirEncuestaUseCase } from './application/use-cases/emitir-encuesta.use-case';
import { TicketCsatListener } from './infrastructure/listeners/ticket-csat.listener';
import { ResolverEncuestaTokenService } from './application/services/resolver-encuesta-token.service';
import { ConsultarEncuestaUseCase } from './application/use-cases/consultar-encuesta.use-case';
import { ResponderEncuestaUseCase } from './application/use-cases/responder-encuesta.use-case';
import { EncuestaPublicaController } from './interface/controllers/encuesta-publica.controller';
import {
  CSAT_THROTTLE_LIMIT,
  CSAT_THROTTLE_TTL_MS,
  CsatThrottlerGuard,
} from './infrastructure/guards/csat-throttler.guard';

/**
 * CsatModule — módulo NestJS de emisión + endpoint público de la encuesta de
 * satisfacción (ADR-C3 del design). Alcance de WU7: se completa el wiring
 * con `ResolverEncuestaTokenService` (WU5), los use cases del endpoint
 * público (`ConsultarEncuestaUseCase`/`ResponderEncuestaUseCase`) y
 * `EncuestaPublicaController` + `CsatThrottlerGuard` (ADR-C6).
 *
 * Wiring:
 * - `ENCUESTA_TOKEN_REPOSITORY` → `PrismaEncuestaTokenRepository` (MASTER,
 *   propio de este módulo).
 * - Importa `AuthModule` por `CLIENTE_REPOSITORY` (exportado ahí — ver
 *   `AuthModule`/`ClientesModule`, este último NO lo exporta).
 * - Importa `TicketsModule` por `TICKET_REPOSITORY` (el listener necesita
 *   numero/titulo/solicitanteId — el evento `ticket.estado_cambiado` no
 *   lleva PII, mismo criterio que `TicketNotificacionListener`; los use
 *   cases del endpoint público también lo usan para devolver el número).
 * - Importa `NotificacionesModule` por `EMAIL_SENDER`/`USUARIO_CONTACTO_RESOLVER`
 *   (reusa el mismo `TenantAwareEmailSender` y el mismo resolver de
 *   contacto cross-DB que el resto de las notificaciones).
 * - Importa `CsatLecturaModule` por `ENCUESTA_SATISFACCION_REPOSITORY`
 *   (`ResponderEncuestaUseCase` inserta la respuesta en el tenant).
 * - `ThrottlerModule.forRoot()` (ADR-C6): storage en memoria, propio de este
 *   módulo — SIN `APP_GUARD`, el guard se aplica SOLO en
 *   `EncuestaPublicaController` vía `@UseGuards`.
 * - `TenantContext`/`LOGGER` son globales vía `SharedModule` — no hace
 *   falta reimportarlo.
 *
 * FITNESS RULE: @prisma/client y los clientes generados (`.prisma/*`) solo
 * pueden importarse desde infrastructure/ (ver backend/eslint.config.js).
 * `PrismaService` (la clase wrapper, no el cliente generado) SÍ puede
 * inyectarse por tipo fuera de infrastructure/ — mismo patrón que
 * `ResolverEncuestaTokenService` (WU5).
 *
 * Ref design: ADR-C1, ADR-C3, ADR-C6, flujo de datos. Tarea: 6.3, 7.3.
 */
@Module({
  imports: [
    AuthModule,
    TicketsModule,
    NotificacionesModule,
    CsatLecturaModule,
    ThrottlerModule.forRoot([{ limit: CSAT_THROTTLE_LIMIT, ttl: CSAT_THROTTLE_TTL_MS }]),
  ],
  controllers: [EncuestaPublicaController],
  providers: [
    { provide: ENCUESTA_TOKEN_REPOSITORY, useClass: PrismaEncuestaTokenRepository },

    {
      provide: EmitirEncuestaUseCase,
      useFactory: (tokenRepo: IEncuestaTokenRepository, emailSender: IEmailSender) =>
        new EmitirEncuestaUseCase(tokenRepo, emailSender),
      inject: [ENCUESTA_TOKEN_REPOSITORY, EMAIL_SENDER],
    },
    {
      provide: TicketCsatListener,
      useFactory: (
        ticketRepo: ITicketRepository,
        clienteRepo: IClienteRepository,
        contactoResolver: IUsuarioContactoResolver,
        emitirEncuestaUseCase: EmitirEncuestaUseCase,
        tenantContext: TenantContext,
        logger: ILogger,
      ) =>
        new TicketCsatListener(
          ticketRepo,
          clienteRepo,
          contactoResolver,
          emitirEncuestaUseCase,
          tenantContext,
          logger,
        ),
      inject: [
        TICKET_REPOSITORY,
        CLIENTE_REPOSITORY,
        USUARIO_CONTACTO_RESOLVER,
        EmitirEncuestaUseCase,
        TenantContext,
        LOGGER,
      ],
    },

    // ─── WU7: binder único + use cases del endpoint público ────────────────
    {
      provide: ResolverEncuestaTokenService,
      useFactory: (
        tokenRepo: IEncuestaTokenRepository,
        clienteRepo: IClienteRepository,
        prismaService: PrismaService,
        tenantContext: TenantContext,
      ) => new ResolverEncuestaTokenService(tokenRepo, clienteRepo, prismaService, tenantContext),
      inject: [ENCUESTA_TOKEN_REPOSITORY, CLIENTE_REPOSITORY, PrismaService, TenantContext],
    },
    {
      provide: ConsultarEncuestaUseCase,
      useFactory: (resolver: ResolverEncuestaTokenService, ticketRepo: ITicketRepository) =>
        new ConsultarEncuestaUseCase(resolver, ticketRepo),
      inject: [ResolverEncuestaTokenService, TICKET_REPOSITORY],
    },
    {
      provide: ResponderEncuestaUseCase,
      useFactory: (
        resolver: ResolverEncuestaTokenService,
        tokenRepo: IEncuestaTokenRepository,
        satisfaccionRepo: IEncuestaSatisfaccionRepository,
        ticketRepo: ITicketRepository,
      ) => new ResponderEncuestaUseCase(resolver, tokenRepo, satisfaccionRepo, ticketRepo),
      inject: [
        ResolverEncuestaTokenService,
        ENCUESTA_TOKEN_REPOSITORY,
        ENCUESTA_SATISFACCION_REPOSITORY,
        TICKET_REPOSITORY,
      ],
    },

    // ─── WU7: guard (ADR-C6) — Injectable simple, sin factory (mismo
    // criterio que los guards de AuthModule: clase referenciada directo
    // por `@UseGuards`, Nest resuelve sus propias dependencias heredadas
    // de `ThrottlerGuard` con el contenedor de este módulo). ─────────────
    CsatThrottlerGuard,
  ],
})
export class CsatModule {}
