import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

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

import { CrearPlanUseCase } from './application/use-cases/crear-plan.use-case';
import { EditarPlanUseCase } from './application/use-cases/editar-plan.use-case';
import { ListarPlanesUseCase } from './application/use-cases/listar-planes.use-case';
import { DarDeBajaPlanUseCase } from './application/use-cases/dar-de-baja-plan.use-case';
import { ListarGeneracionesPlanUseCase } from './application/use-cases/listar-generaciones-plan.use-case';

import { PreventivoController } from './interface/controllers/preventivo.controller';

/**
 * PreventivoModule — módulo NestJS del ABM de planes de mantenimiento
 * preventivo (WU-4, sdd/preventivo).
 *
 * Wiring hexagonal (domain/ → application/ → infrastructure/ → interface/),
 * mismo criterio que `EquiposModule`/`ReparacionesModule`:
 * - `AuthModule`: los guards de `PreventivoController` (`JwtAuthGuard`,
 *   `TenantGuard`, `AccionesGuard`) lo necesitan importado explícitamente
 *   (no re-exportado transitivamente por otro módulo de negocio).
 * - `TENANT_TX_RUNNER` se inyecta desde `SharedModule` (`@Global`).
 *
 * ALCANCE DE WU-4: solo el ABM (crear/editar/listar/dar de baja + vista de
 * generaciones). NO registra `PreventivoSweepScheduler` ni llama
 * `ScheduleModule.forRoot()` (ya vive en `AppModule` por WU-0) — el barrido
 * y la transacción de generación son WU-5.
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule],
  controllers: [PreventivoController],
  providers: [
    { provide: PLAN_PREVENTIVO_REPOSITORY, useClass: PrismaPlanPreventivoRepository },
    { provide: PREVENTIVO_GENERACION_REPOSITORY, useClass: PrismaPreventivoGeneracionRepository },
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
  ],
  exports: [PLAN_PREVENTIVO_REPOSITORY, PREVENTIVO_GENERACION_REPOSITORY],
})
export class PreventivoModule {}
