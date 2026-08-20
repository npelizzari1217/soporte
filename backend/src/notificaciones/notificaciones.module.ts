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
import { TenantAwareEmailSender } from './infrastructure/email/tenant-aware-email-sender';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import { TenantContext } from '../shared/tenancy/tenant-context';
import {
  CLIENTE_EMAIL_CONFIG_REPOSITORY,
  IClienteEmailConfigRepository,
} from '../clientes/domain/ports/i-cliente-email-config.repository';
import { PrismaClienteEmailConfigRepository } from '../clientes/infrastructure/persistence/prisma/prisma-cliente-email-config.repository';

/**
 * NotificacionesModule — módulo NestJS del dominio "notificaciones" (Fase 4,
 * PR-N + SB7/SB8 diferidos de PR-SLA-2).
 *
 * Notificaciones por email disparadas por eventos de dominio YA emitidos
 * (ADR-6, ADR-P2): `ticket.estado_cambiado`/`ticket.comentado` (Fase 2, N3)
 * y `sla.vencido` (Fase 4/SLA, S4 — asignado + administradores del tenant).
 *
 * Wiring:
 * - `EMAIL_SENDER` → `TenantAwareEmailSender` (D3,
 *   sdd/configuracion-correo-por-cliente WU5): resuelve la identidad SMTP
 *   del cliente ACTIVO en cada `send()` desde su config propia, en vez del
 *   transporter único construido una vez al arrancar que existía antes de
 *   este cambio (`resolveEmailSender`, hoy sin binding — se deja el archivo
 *   por ser la fuente de las env vars `SMTP_*` que consume el backfill,
 *   decisión #2361/3). Degrada explícito (no envía, no lanza) sin
 *   `TenantContext`, sin config del cliente, o si falla el descifrado —
 *   nunca fail-fast (D2).
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
      provide: CLIENTE_EMAIL_CONFIG_REPOSITORY,
      useClass: PrismaClienteEmailConfigRepository,
    },
    {
      provide: EMAIL_SENDER,
      useFactory: (
        tenantContext: TenantContext,
        emailConfigRepo: IClienteEmailConfigRepository,
        logger: ILogger,
      ) => new TenantAwareEmailSender(tenantContext, emailConfigRepo, logger),
      inject: [TenantContext, CLIENTE_EMAIL_CONFIG_REPOSITORY, LOGGER],
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
