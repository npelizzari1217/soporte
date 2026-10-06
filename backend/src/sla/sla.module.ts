import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TICKET_REPOSITORY, ITicketRepository } from '../tickets/domain/ports/i-ticket.repository';
import {
  PRIORIDAD_REPOSITORY,
  IPrioridadRepository,
} from '../tickets/domain/ports/i-prioridad.repository';
import {
  PRIMERA_RESPUESTA_WRITE_REPOSITORY,
  IPrimeraRespuestaWriteRepository,
} from '../tickets/domain/ports/i-primera-respuesta-write.repository';
import {
  TIPO_TICKET_REPOSITORY,
  ITipoTicketRepository,
} from '../tickets/domain/ports/i-tipo-ticket.repository';

import {
  SLA_TICKET_QUERY_REPOSITORY,
  ISlaTicketQueryRepository,
} from './domain/ports/i-sla-ticket-query.repository';
import { PrismaSlaTicketQueryRepository } from './infrastructure/persistence/prisma/prisma-sla-ticket-query.repository';
import { TENANT_ENUMERATOR, ITenantEnumerator } from '../shared/domain/ports/i-tenant-enumerator';

import { CalendarioLaboralModule } from '../calendario-laboral/calendario-laboral.module';
import {
  CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
  ICalendarioLaboralSemanalRepository,
} from '../calendario-laboral/domain/ports/i-calendario-laboral-semanal.repository';
import {
  FERIADOS_LABORALES_REPOSITORY,
  IFeriadosLaboralesRepository,
} from '../calendario-laboral/domain/ports/i-feriados-laborales.repository';
import { CalcularSlaHabilVenceService } from '../calendario-laboral/domain/services/calcular-sla-habil-vence.service';

import { AplicarSlaUseCase } from './application/use-cases/aplicar-sla.use-case';
import { MarcarVencidosUseCase } from './application/use-cases/marcar-vencidos.use-case';

import { RELOJ_SLA_REPOSITORY, IRelojSlaRepository } from './domain/ports/i-reloj-sla.repository';
import { PrismaRelojSlaRepository } from './infrastructure/persistence/prisma/prisma-reloj-sla.repository';
import { ConsolidarRelojSlaUseCase } from './application/use-cases/consolidar-reloj-sla.use-case';
import { RelojSlaListener } from './infrastructure/listeners/reloj-sla.listener';
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
 * - Repos: SLA_TICKET_QUERY_REPOSITORY, RELOJ_SLA_REPOSITORY (tenant,
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
 * - sdd/sla-habil WU-3: `AplicarSlaUseCase` suma `CalcularSlaHabilVenceService`
 *   (WU-1, cálculo puro) + `CALENDARIO_LABORAL_SEMANAL_REPOSITORY`/
 *   `FERIADOS_LABORALES_REPOSITORY` (WU-2, `CalendarioLaboralModule`) para
 *   elegir el calculador por `ticket.slaRegla` (discriminador de cohortes:
 *   `CORRIDO` mide tiempo de pared, `HABIL` tiempo hábil; ver `RelojSla.medidorPara`).
 *   Este módulo importa `CalendarioLaboralModule` para inyectar esos dos
 *   puertos — NO reimplementa el acceso a MASTER ni a la base del tenant
 *   (el calendario es por cliente desde sdd/horario-laboral-por-cliente).
 * - `ScheduleModule.forRoot()` ya NO se llama acá: se movió a `AppModule`
 *   (ola-2 WU-0) porque dos `forRoot()` de `@nestjs/schedule` fallan al
 *   bootear (no al compilar) si otro módulo (`preventivo`) también lo llama.
 * - Importa `TicketsModule` (para TICKET_REPOSITORY/
 *   PRIORIDAD_REPOSITORY/TIPO_TICKET_REPOSITORY, que `AplicarSlaUseCase`
 *   necesita — el módulo SLA NO reimplementa ese acceso), `CalendarioLaboralModule`
 *   y `AuthModule`.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule, TicketsModule, CalendarioLaboralModule],
  providers: [
    { provide: SLA_TICKET_QUERY_REPOSITORY, useClass: PrismaSlaTicketQueryRepository },

    { provide: RELOJ_SLA_REPOSITORY, useClass: PrismaRelojSlaRepository },

    { provide: CalcularSlaHabilVenceService, useFactory: () => new CalcularSlaHabilVenceService() },

    {
      provide: AplicarSlaUseCase,
      useFactory: (
        prioridadRepo: IPrioridadRepository,
        relojRepo: IRelojSlaRepository,
        ticketRepo: ITicketRepository,
        tipoTicketRepo: ITipoTicketRepository,
        calculoHabil: CalcularSlaHabilVenceService,
        calendarioRepo: ICalendarioLaboralSemanalRepository,
        feriadosRepo: IFeriadosLaboralesRepository,
        primeraRespuestaRepo: IPrimeraRespuestaWriteRepository,
      ) =>
        new AplicarSlaUseCase(
          prioridadRepo,
          relojRepo,
          ticketRepo,
          tipoTicketRepo,
          calculoHabil,
          calendarioRepo,
          feriadosRepo,
          primeraRespuestaRepo,
        ),
      inject: [
        PRIORIDAD_REPOSITORY,
        RELOJ_SLA_REPOSITORY,
        TICKET_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        CalcularSlaHabilVenceService,
        CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
        FERIADOS_LABORALES_REPOSITORY,
        PRIMERA_RESPUESTA_WRITE_REPOSITORY,
      ],
    },
    {
      provide: MarcarVencidosUseCase,
      useFactory: (
        relojRepo: IRelojSlaRepository,
        consolidar: ConsolidarRelojSlaUseCase,
        slaTicketQueryRepo: ISlaTicketQueryRepository,
        eventPublisher: IDomainEventPublisher,
        logger: ILogger,
      ) =>
        new MarcarVencidosUseCase(
          relojRepo,
          consolidar,
          slaTicketQueryRepo,
          eventPublisher,
          logger,
        ),
      inject: [
        RELOJ_SLA_REPOSITORY,
        ConsolidarRelojSlaUseCase,
        SLA_TICKET_QUERY_REPOSITORY,
        DOMAIN_EVENT_PUBLISHER,
        LOGGER,
      ],
    },

    {
      provide: ConsolidarRelojSlaUseCase,
      useFactory: (
        repo: IRelojSlaRepository,
        calculo: CalcularSlaHabilVenceService,
        calendarioRepo: ICalendarioLaboralSemanalRepository,
        feriadosRepo: IFeriadosLaboralesRepository,
        logger: ILogger,
      ) => new ConsolidarRelojSlaUseCase(repo, calculo, calendarioRepo, feriadosRepo, logger),
      inject: [
        RELOJ_SLA_REPOSITORY,
        CalcularSlaHabilVenceService,
        CALENDARIO_LABORAL_SEMANAL_REPOSITORY,
        FERIADOS_LABORALES_REPOSITORY,
        LOGGER,
      ],
    },
    {
      provide: RelojSlaListener,
      useFactory: (consolidar: ConsolidarRelojSlaUseCase, logger: ILogger) =>
        new RelojSlaListener(consolidar, logger),
      inject: [ConsolidarRelojSlaUseCase, LOGGER],
    },

    {
      provide: AplicarSlaListener,
      useFactory: (aplicarSlaUseCase: AplicarSlaUseCase, logger: ILogger) =>
        new AplicarSlaListener(aplicarSlaUseCase, logger),
      inject: [AplicarSlaUseCase, LOGGER],
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
  exports: [SLA_TICKET_QUERY_REPOSITORY],
})
export class SlaModule {}
