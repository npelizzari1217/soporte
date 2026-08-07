import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';

import {
  USUARIO_CONTACTO_RESOLVER,
  IUsuarioContactoResolver,
} from './domain/ports/i-usuario-contacto-resolver';
import { PrismaUsuarioContactoResolver } from './infrastructure/persistence/prisma/prisma-usuario-contacto-resolver';

import { TicketNotificacionListener } from './infrastructure/listeners/ticket-notificacion.listener';
import { SlaVencidoNotificacionListener } from './infrastructure/listeners/sla-vencido-notificacion.listener';

import { EMAIL_SENDER, IEmailSender } from '../shared/domain/ports/i-email-sender';
import { resolveEmailSender } from './infrastructure/email/email-sender.factory';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import { TenantContext } from '../shared/tenancy/tenant-context';

/**
 * NotificacionesModule — módulo NestJS del dominio "notificaciones" (Fase 4,
 * PR-N + SB7/SB8 diferidos de PR-SLA-2).
 *
 * Notificaciones por email disparadas por eventos de dominio YA emitidos
 * (ADR-6, ADR-P2): `ticket.estado_cambiado`/`ticket.comentado` (Fase 2, N3)
 * y `sla.vencido` (Fase 4/SLA, S4 — asignado + administradores del tenant).
 *
 * Wiring:
 * - `EMAIL_SENDER` → `resolveEmailSender(process.env, logger)` (ADR-P7):
 *   degrada a `NoOpEmailSender` (log-only) si falta config SMTP completa —
 *   NUNCA fail-fast en el arranque (N2, crítico para beta local).
 * - `USUARIO_CONTACTO_RESOLVER` → `PrismaUsuarioContactoResolver` (master).
 * - Listeners: `TicketNotificacionListener` (estado_cambiado/comentado,
 *   solicitante) + `SlaVencidoNotificacionListener` (sla.vencido, asignado
 *   + administradores — hereda el `TenantContext` del `tenantContext.run()`
 *   del job SLA, ADR-P8).
 * - Importa `TicketsModule` (TICKET_REPOSITORY — los listeners cargan el
 *   ticket para numero/titulo/solicitanteId/asignadoId, los eventos no
 *   llevan PII). No expone controllers (módulo sin endpoints HTTP en beta).
 * - `EventEmitterModule` es global (`SharedModule.forRoot()`, ver
 *   shared.module.ts) — los `@OnEvent` de este módulo se registran sin
 *   reimportarlo acá.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [TicketsModule],
  controllers: [],
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (logger: ILogger) => resolveEmailSender(process.env, logger),
      inject: [LOGGER],
    },
    { provide: USUARIO_CONTACTO_RESOLVER, useClass: PrismaUsuarioContactoResolver },

    {
      provide: TicketNotificacionListener,
      useFactory: (
        ticketRepo: ITicketRepository,
        contactoResolver: IUsuarioContactoResolver,
        emailSender: IEmailSender,
      ) => new TicketNotificacionListener(ticketRepo, contactoResolver, emailSender),
      inject: [TICKET_REPOSITORY, USUARIO_CONTACTO_RESOLVER, EMAIL_SENDER],
    },
    {
      provide: SlaVencidoNotificacionListener,
      useFactory: (
        ticketRepo: ITicketRepository,
        contactoResolver: IUsuarioContactoResolver,
        emailSender: IEmailSender,
        tenantContext: TenantContext,
      ) =>
        new SlaVencidoNotificacionListener(
          ticketRepo,
          contactoResolver,
          emailSender,
          tenantContext,
        ),
      inject: [TICKET_REPOSITORY, USUARIO_CONTACTO_RESOLVER, EMAIL_SENDER, TenantContext],
    },
  ],
  exports: [EMAIL_SENDER, USUARIO_CONTACTO_RESOLVER],
})
export class NotificacionesModule {}
