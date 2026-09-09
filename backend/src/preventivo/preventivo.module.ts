import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import { EquiposModule } from '../equipos/equipos.module';
import {
  TIPO_TICKET_REPOSITORY,
  ITipoTicketRepository,
} from '../tickets/domain/ports/i-tipo-ticket.repository';
import { CrearTicketUseCase } from '../tickets/application/use-cases/crear-ticket.use-case';
import {
  EQUIPO_INFORMATICO_REPOSITORY,
  IEquipoInformaticoRepository,
} from '../equipos/domain/ports/i-equipo-informatico.repository';
import { TENANT_ENUMERATOR, ITenantEnumerator } from '../shared/domain/ports/i-tenant-enumerator';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { LOGGER, ILogger } from '../shared/domain/ports/i-logger.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  IDomainEventPublisher,
} from '../shared/domain/ports/i-domain-event-publisher';

import {
  ITenantTransactionRunner,
  TENANT_TX_RUNNER,
} from '../shared/infrastructure/persistence/tenant-transaction-runner';

import {
  PLAN_PREVENTIVO_REPOSITORY,
  IPlanPreventivoRepository,
} from './domain/ports/i-plan-preventivo.repository';
import { PrismaPlanPreventivoRepository } from './infrastructure/persistence/prisma/prisma-plan-preventivo.repository';
import {
  PREVENTIVO_GENERACION_REPOSITORY,
  IPreventivoGeneracionRepository,
} from './domain/ports/i-preventivo-generacion.repository';
import { PrismaPreventivoGeneracionRepository } from './infrastructure/persistence/prisma/prisma-preventivo-generacion.repository';
import { CalcularCicloService } from './domain/services/calcular-ciclo.service';

import { CrearPlanUseCase } from './application/use-cases/crear-plan.use-case';
import { EditarPlanUseCase } from './application/use-cases/editar-plan.use-case';
import { ListarPlanesUseCase } from './application/use-cases/listar-planes.use-case';
import { DarDeBajaPlanUseCase } from './application/use-cases/dar-de-baja-plan.use-case';
import { ListarGeneracionesPlanUseCase } from './application/use-cases/listar-generaciones-plan.use-case';
import { GenerarPreventivosUseCase } from './application/use-cases/generar-preventivos.use-case';

import { PreventivoController } from './interface/controllers/preventivo.controller';
import { PreventivoSweepScheduler } from './infrastructure/schedulers/preventivo-sweep.scheduler';

/**
 * PreventivoModule — módulo NestJS del ABM de planes de mantenimiento
 * preventivo (WU-4, sdd/preventivo).
 *
 * Wiring hexagonal (domain/ → application/ → infrastructure/ → interface/),
 * mismo criterio que `EquiposModule`/`ReparacionesModule`:
 * - `AuthModule`: los guards de `PreventivoController` (`JwtAuthGuard`,
 *   `TenantGuard`, `AccionesGuard`) lo necesitan importado explícitamente
 *   (no re-exportado transitivamente por otro módulo de negocio).
 * - `TENANT_TX_RUNNER`/`TENANT_ENUMERATOR`/`TenantContext`/`PrismaService`/
 *   `LOGGER`/`DOMAIN_EVENT_PUBLISHER` se inyectan desde `SharedModule`
 *   (`@Global`).
 * - `TicketsModule`: `GenerarPreventivosUseCase` (WU-5) reusa
 *   `CrearTicketUseCase` (exportado por `TicketsModule` desde 5.1) y
 *   `TIPO_TICKET_REPOSITORY` para resolver el tipo FIJO `PREVENTIVO`
 *   (issue #135: antes reusaba `MANTENIMIENTO` del módulo EDILICIA).
 * - `EquiposModule` (WU-2, ADR-2): `GenerarPreventivosUseCase` suma un
 *   noveno parámetro `Pick<IEquipoInformaticoRepository, 'findById'>` para
 *   resolver el objetivo del ticket. `EquiposModule` ya exporta
 *   `EQUIPO_INFORMATICO_REPOSITORY` y no importa `PreventivoModule`: sin
 *   ciclo. No se crea un puerto propio de preventivo para el mismo contrato.
 *
 * WU-5 agrega la generación automática: `GenerarPreventivosUseCase`
 * (orquestación transaccional del ciclo, ADR-PV2/PV3/PV5) y
 * `PreventivoSweepScheduler` (`@Cron`, fan-out multi-tenant). NO llama
 * `ScheduleModule.forRoot()` (ya vive en `AppModule` desde WU-0). WU-6 [R11]
 * agrega la publicación post-commit de `preventivo.generado` (`DOMAIN_EVENT_PUBLISHER`,
 * consumida por `NotificacionesModule` vía `PreventivoGeneradoNotificacionListener`).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule, TicketsModule, EquiposModule],
  controllers: [PreventivoController],
  providers: [
    { provide: PLAN_PREVENTIVO_REPOSITORY, useClass: PrismaPlanPreventivoRepository },
    { provide: PREVENTIVO_GENERACION_REPOSITORY, useClass: PrismaPreventivoGeneracionRepository },
    { provide: CalcularCicloService, useFactory: () => new CalcularCicloService() },
    {
      provide: CrearPlanUseCase,
      useFactory: (planRepo: IPlanPreventivoRepository, txRunner: ITenantTransactionRunner) =>
        new CrearPlanUseCase(planRepo, txRunner),
      inject: [PLAN_PREVENTIVO_REPOSITORY, TENANT_TX_RUNNER],
    },
    {
      provide: EditarPlanUseCase,
      useFactory: (planRepo: IPlanPreventivoRepository, txRunner: ITenantTransactionRunner) =>
        new EditarPlanUseCase(planRepo, txRunner),
      inject: [PLAN_PREVENTIVO_REPOSITORY, TENANT_TX_RUNNER],
    },
    {
      provide: ListarPlanesUseCase,
      useFactory: (planRepo: IPlanPreventivoRepository) => new ListarPlanesUseCase(planRepo),
      inject: [PLAN_PREVENTIVO_REPOSITORY],
    },
    {
      provide: DarDeBajaPlanUseCase,
      useFactory: (planRepo: IPlanPreventivoRepository) => new DarDeBajaPlanUseCase(planRepo),
      inject: [PLAN_PREVENTIVO_REPOSITORY],
    },
    {
      provide: ListarGeneracionesPlanUseCase,
      useFactory: (
        planRepo: IPlanPreventivoRepository,
        generacionRepo: IPreventivoGeneracionRepository,
      ) => new ListarGeneracionesPlanUseCase(planRepo, generacionRepo),
      inject: [PLAN_PREVENTIVO_REPOSITORY, PREVENTIVO_GENERACION_REPOSITORY],
    },
    {
      provide: GenerarPreventivosUseCase,
      useFactory: (
        planRepo: IPlanPreventivoRepository,
        generacionRepo: IPreventivoGeneracionRepository,
        tipoTicketRepo: ITipoTicketRepository,
        crearTicketUseCase: CrearTicketUseCase,
        txRunner: ITenantTransactionRunner,
        calcularCiclo: CalcularCicloService,
        logger: ILogger,
        eventPublisher: IDomainEventPublisher,
        equipoRepo: IEquipoInformaticoRepository,
      ) =>
        new GenerarPreventivosUseCase(
          planRepo,
          generacionRepo,
          tipoTicketRepo,
          crearTicketUseCase,
          txRunner,
          calcularCiclo,
          logger,
          eventPublisher,
          equipoRepo,
        ),
      inject: [
        PLAN_PREVENTIVO_REPOSITORY,
        PREVENTIVO_GENERACION_REPOSITORY,
        TIPO_TICKET_REPOSITORY,
        CrearTicketUseCase,
        TENANT_TX_RUNNER,
        CalcularCicloService,
        LOGGER,
        DOMAIN_EVENT_PUBLISHER,
        EQUIPO_INFORMATICO_REPOSITORY,
      ],
    },
    {
      provide: PreventivoSweepScheduler,
      useFactory: (
        tenantEnumerator: ITenantEnumerator,
        tenantContext: TenantContext,
        prismaService: PrismaService,
        generarPreventivosUseCase: GenerarPreventivosUseCase,
        logger: ILogger,
      ) =>
        new PreventivoSweepScheduler(
          tenantEnumerator,
          tenantContext,
          prismaService,
          generarPreventivosUseCase,
          logger,
        ),
      inject: [TENANT_ENUMERATOR, TenantContext, PrismaService, GenerarPreventivosUseCase, LOGGER],
    },
  ],
  exports: [PLAN_PREVENTIVO_REPOSITORY, PREVENTIVO_GENERACION_REPOSITORY],
})
export class PreventivoModule {}
