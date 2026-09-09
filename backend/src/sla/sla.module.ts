import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';
import { ESTADO_REPOSITORY, IEstadoRepository } from '../tickets/domain/ports/i-estado.repository';
import {
  PRIORIDAD_REPOSITORY,
  IPrioridadRepository,
} from '../tickets/domain/ports/i-prioridad.repository';
import {
  TIPO_TICKET_REPOSITORY,
  ITipoTicketRepository,
} from '../tickets/domain/ports/i-tipo-ticket.repository';

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
import { TENANT_ENUMERATOR, ITenantEnumerator } from '../shared/domain/ports/i-tenant-enumerator';

import { CalcularSlaVenceService } from './domain/services/calcular-sla-vence.service';
import { AplicarSlaUseCase } from './application/use-cases/aplicar-sla.use-case';
import { MarcarVencidosUseCase } from './application/use-cases/marcar-vencidos.use-case';

import { AplicarSlaListener } from './infrastructure/listeners/aplicar-sla.listener';
import { SlaSweepScheduler } from './infrastructure/schedulers/sla-sweep.scheduler';

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
 * Cálculo y seguimiento de SLA sobre tickets: cálculo de `sla_vence_at` al
 * crear/repriorizar (S2/S3, vía listeners
 * `ticket.creado`/`ticket.reprioritizado` emitidos ADITIVAMENTE por
 * `TicketsModule`), y barrido periódico multi-tenant de vencimiento (S4/S5)
 * que emite `sla.vencido` (consumido por Notificaciones, PR-N — fuera de
 * este alcance).
 *
 * El CRUD de configuración de SLA (antes S1: tabla separada `sla_config`,
 * `SlaConfigController` en `/sla/config`) se ELIMINÓ — las horas/activo de
 * SLA pasaron a ser columnas de `prioridades` (`slaHoras`/`slaActivo`),
 * editables desde `CatalogosController` (`/catalogos/prioridades`,
 * `TicketsModule`). Este módulo ahora es SOLO cálculo/seguimiento.
 *
 * Wiring:
 * - Repos: SLA_TICKET_WRITE_REPOSITORY, SLA_TICKET_QUERY_REPOSITORY (tenant,
 *   vía TenantContext). TENANT_ENUMERATOR (master, vía PrismaService — S5) ya
 *   NO se registra acá: se promovió a `SharedModule` (`@Global()`, ola-2
 *   WU-0) para que no quede acoplado a `sla`. Este módulo solo lo INYECTA.
 * - Use cases: AplicarSla (S2/S3, escucha eventos vía AplicarSlaListener —
 *   lee `slaHoras`/`slaActivo` vía `PRIORIDAD_REPOSITORY`, exportado por
 *   `TicketsModule`), MarcarVencidos (S4, corrido por tenant desde
 *   SlaSweepScheduler).
 * - issue #135: `AplicarSlaUseCase` suma `TIPO_TICKET_REPOSITORY`
 *   (`findIdByCodigo`, mismo puerto que ya usa `GenerarPreventivosUseCase`)
 *   para cortar el cálculo de SLA de los tickets de tipo `PREVENTIVO` — no
 *   crea un puerto propio, ya lo exporta `TicketsModule`.
 * - `ScheduleModule.forRoot()` ya NO se llama acá: se movió a `AppModule`
 *   (ola-2 WU-0) porque dos `forRoot()` de `@nestjs/schedule` fallan al
 *   bootear (no al compilar) si otro módulo (`preventivo`) también lo llama.
 * - Importa `TicketsModule` (para TICKET_REPOSITORY/ESTADO_REPOSITORY/
 *   PRIORIDAD_REPOSITORY/TIPO_TICKET_REPOSITORY, que `AplicarSlaUseCase`
 *   necesita — el módulo SLA NO reimplementa ese acceso) y `AuthModule`.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule, TicketsModule],
  providers: [
    { provide: SLA_TICKET_WRITE_REPOSITORY, useClass: PrismaSlaTicketWriteRepository },
    { provide: SLA_TICKET_QUERY_REPOSITORY, useClass: PrismaSlaTicketQueryRepository },

    { provide: CalcularSlaVenceService, useFactory: () => new CalcularSlaVenceService() },

    {
      provide: AplicarSlaUseCase,
      useFactory: (
        prioridadRepo: IPrioridadRepository,
        slaTicketWriteRepo: ISlaTicketWriteRepository,
        ticketRepo: ITicketRepository,
        estadoRepo: IEstadoRepository,
        calculador: CalcularSlaVenceService,
        tipoTicketRepo: ITipoTicketRepository,
      ) =>
        new AplicarSlaUseCase(
          prioridadRepo,
          slaTicketWriteRepo,
          ticketRepo,
          estadoRepo,
          calculador,
          tipoTicketRepo,
        ),
      inject: [
        PRIORIDAD_REPOSITORY,
        SLA_TICKET_WRITE_REPOSITORY,
        TICKET_REPOSITORY,
        ESTADO_REPOSITORY,
        CalcularSlaVenceService,
        TIPO_TICKET_REPOSITORY,
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
  exports: [SLA_TICKET_WRITE_REPOSITORY, SLA_TICKET_QUERY_REPOSITORY],
})
export class SlaModule {}
