import { Module } from '@nestjs/common';
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

import {
  ENCUESTA_TOKEN_REPOSITORY,
  IEncuestaTokenRepository,
} from './domain/ports/i-encuesta-token.repository';
import { PrismaEncuestaTokenRepository } from './infrastructure/persistence/prisma/prisma-encuesta-token.repository';

import { EmitirEncuestaUseCase } from './application/use-cases/emitir-encuesta.use-case';
import { TicketCsatListener } from './infrastructure/listeners/ticket-csat.listener';

/**
 * CsatModule — módulo NestJS de emisión de la encuesta de satisfacción
 * (ADR-C3 del design). Alcance de WU6: `EmitirEncuestaUseCase` +
 * `TicketCsatListener`. `ResolverEncuestaTokenService` (WU5, ya existe) y el
 * controller público (WU7) se wirean en un WU posterior — fuera del alcance
 * de este.
 *
 * Wiring:
 * - `ENCUESTA_TOKEN_REPOSITORY` → `PrismaEncuestaTokenRepository` (MASTER,
 *   propio de este módulo).
 * - Importa `AuthModule` por `CLIENTE_REPOSITORY` (exportado ahí — ver
 *   `AuthModule`/`ClientesModule`, este último NO lo exporta).
 * - Importa `TicketsModule` por `TICKET_REPOSITORY` (el listener necesita
 *   numero/titulo/solicitanteId — el evento `ticket.estado_cambiado` no
 *   lleva PII, mismo criterio que `TicketNotificacionListener`).
 * - Importa `NotificacionesModule` por `EMAIL_SENDER`/`USUARIO_CONTACTO_RESOLVER`
 *   (reusa el mismo `TenantAwareEmailSender` y el mismo resolver de
 *   contacto cross-DB que el resto de las notificaciones).
 * - Importa `CsatLecturaModule` para completar el particionado de ADR-C3,
 *   aunque WU6 todavía no consume `ENCUESTA_SATISFACCION_REPOSITORY`
 *   (llega en WU7/WU9).
 * - `TenantContext`/`LOGGER` son globales vía `SharedModule` — no hace
 *   falta reimportarlo.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 *
 * Ref design: ADR-C3, flujo de datos. Tarea: 6.3.
 */
@Module({
  imports: [AuthModule, TicketsModule, NotificacionesModule, CsatLecturaModule],
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
  ],
})
export class CsatModule {}
