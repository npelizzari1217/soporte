import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../tickets/domain/ports/i-estado.repository';

import {
  SLA_CONFIG_REPOSITORY,
  ISlaConfigRepository,
} from './domain/ports/i-sla-config.repository';
import { PrismaSlaConfigRepository } from './infrastructure/persistence/prisma/prisma-sla-config.repository';
import {
  SLA_TICKET_WRITE_REPOSITORY,
  ISlaTicketWriteRepository,
} from './domain/ports/i-sla-ticket-write.repository';
import { PrismaSlaTicketWriteRepository } from './infrastructure/persistence/prisma/prisma-sla-ticket-write.repository';
import {
  SLA_TICKET_QUERY_REPOSITORY,
  ISlaTicketQueryRepository,
} from './domain/ports/i-sla-ticket-query.repository';
import { PrismaSlaTicketQueryRepository } from './infrastructure/persistence/prisma/prisma-sla-ticket-query.repository';
import { TENANT_ENUMERATOR, ITenantEnumerator } from './domain/ports/i-tenant-enumerator';
import { PrismaTenantEnumerator } from './infrastructure/persistence/prisma/prisma-tenant-enumerator';

import { CalcularSlaVenceService } from './domain/services/calcular-sla-vence.service';
import { EditarSlaConfigUseCase } from './application/use-cases/editar-sla-config.use-case';
import { ListarSlaConfigUseCase } from './application/use-cases/listar-sla-config.use-case';
import { AplicarSlaUseCase } from './application/use-cases/aplicar-sla.use-case';
import { MarcarVencidosUseCase } from './application/use-cases/marcar-vencidos.use-case';

import { AplicarSlaListener } from './infrastructure/listeners/aplicar-sla.listener';
import { SlaSweepScheduler } from './infrastructure/schedulers/sla-sweep.scheduler';

import { SlaConfigController } from './interface/controllers/sla-config.controller';

import { TenantContext } from '../shared/tenancy/tenant-context';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import {
  IDomainEventPublisher,
  DOMAIN_EVENT_PUBLISHER,
} from '../shared/domain/ports/i-domain-event-publisher';

/**
 * SlaModule — módulo NestJS del dominio "sla" (Fase 4, PR-SLA-1 + PR-SLA-2).
 *
 * Cálculo y seguimiento de SLA sobre tickets: config editable por prioridad
 * (S1), cálculo de `sla_vence_at` al crear/repriorizar (S2/S3, vía listeners
 * `ticket.creado`/`ticket.reprioritizado` emitidos ADITIVAMENTE por
 * `TicketsModule`), y barrido periódico multi-tenant de vencimiento (S4/S5)
 * que emite `sla.vencido` (consumido por Notificaciones, PR-N — fuera de
 * este alcance).
 *
 * Wiring:
 * - Repos: SLA_CONFIG_REPOSITORY, SLA_TICKET_WRITE_REPOSITORY,
 *   SLA_TICKET_QUERY_REPOSITORY (tenant, vía TenantContext),
 *   TENANT_ENUMERATOR (master, vía PrismaService — S5).
 * - Use cases: Editar/ListarSlaConfig (S1), AplicarSla (S2/S3, escucha
 *   eventos vía AplicarSlaListener), MarcarVencidos (S4, corrido por tenant
 *   desde SlaSweepScheduler).
 * - `ScheduleModule.forRoot()`: habilita `@Cron` para `SlaSweepScheduler`
 *   (GATE G2 — dep nueva `@nestjs/schedule`).
 * - Importa `TicketsModule` (para TICKET_REPOSITORY/ESTADO_REPOSITORY, que
 *   `AplicarSlaUseCase` necesita para leer `createdAt`/`estadoId` del ticket
 *   — el módulo SLA NO reimplementa ese acceso) y `AuthModule` (guards de
 *   `SlaConfigController`, reusa `catalogo:gestionar` — sin permiso nuevo).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule, TicketsModule, ScheduleModule.forRoot()],
  controllers: [SlaConfigController],
  providers: [
    { provide: SLA_CONFIG_REPOSITORY, useClass: PrismaSlaConfigRepository },
    { provide: SLA_TICKET_WRITE_REPOSITORY, useClass: PrismaSlaTicketWriteRepository },
    { provide: SLA_TICKET_QUERY_REPOSITORY, useClass: PrismaSlaTicketQueryRepository },
    { provide: TENANT_ENUMERATOR, useClass: PrismaTenantEnumerator },

    { provide: CalcularSlaVenceService, useFactory: () => new CalcularSlaVenceService() },

    {
      provide: EditarSlaConfigUseCase,
      useFactory: (repo: ISlaConfigRepository) => new EditarSlaConfigUseCase(repo),
      inject: [SLA_CONFIG_REPOSITORY],
    },
    {
      provide: ListarSlaConfigUseCase,
      useFactory: (repo: ISlaConfigRepository) => new ListarSlaConfigUseCase(repo),
      inject: [SLA_CONFIG_REPOSITORY],
    },
    {
      provide: AplicarSlaUseCase,
      useFactory: (
        slaConfigRepo: ISlaConfigRepository,
        slaTicketWriteRepo: ISlaTicketWriteRepository,
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        calculador: CalcularSlaVenceService,
      ) =>
        new AplicarSlaUseCase(
          slaConfigRepo,
          slaTicketWriteRepo,
          ticketRepo,
          estadoRepo,
          calculador,
        ),
      inject: [
        SLA_CONFIG_REPOSITORY,
        SLA_TICKET_WRITE_REPOSITORY,
        TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        CalcularSlaVenceService,
      ],
    },
    {
      provide: MarcarVencidosUseCase,
      useFactory: (
        slaTicketQueryRepo: ISlaTicketQueryRepository,
        eventPublisher: IDomainEventPublisher,
      ) => new MarcarVencidosUseCase(slaTicketQueryRepo, eventPublisher),
      inject: [SLA_TICKET_QUERY_REPOSITORY, DOMAIN_EVENT_PUBLISHER],
    },

    {
      provide: AplicarSlaListener,
      useFactory: (aplicarSlaUseCase: AplicarSlaUseCase) =>
        new AplicarSlaListener(aplicarSlaUseCase),
      inject: [AplicarSlaUseCase],
    },
    {
      provide: SlaSweepScheduler,
      useFactory: (
        tenantEnumerator: ITenantEnumerator,
        tenantContext: TenantContext,
        prismaService: PrismaService,
        marcarVencidosUseCase: MarcarVencidosUseCase,
        logger: ILogger,
      ) =>
        new SlaSweepScheduler(
          tenantEnumerator,
          tenantContext,
          prismaService,
          marcarVencidosUseCase,
          logger,
        ),
      inject: [TENANT_ENUMERATOR, TenantContext, PrismaService, MarcarVencidosUseCase, LOGGER],
    },
  ],
  exports: [SLA_CONFIG_REPOSITORY, SLA_TICKET_WRITE_REPOSITORY, SLA_TICKET_QUERY_REPOSITORY],
})
export class SlaModule {}
