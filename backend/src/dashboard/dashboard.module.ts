import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';
import {
  CICLO_CLIENTE_REPOSITORY,
  ICicloClienteRepository,
} from '../tickets/domain/ports/i-ciclo-cliente.repository';
import {
  ITareaTicketRepository,
  TAREA_TICKET_REPOSITORY,
} from '../tickets/domain/ports/i-tarea-ticket.repository';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../tickets/domain/ports/i-usuario-master.checker';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { TiempoTecnicoModule } from '../tiempo-tecnico/tiempo-tecnico.module';
import {
  CUMPLIMIENTO_TECNICO_REPOSITORY,
  ICumplimientoTecnicoRepository,
} from '../tiempo-tecnico/domain/ports/i-cumplimiento-tecnico.repository';
import { CsatLecturaModule } from '../csat/csat-lectura.module';
import {
  ENCUESTA_SATISFACCION_REPOSITORY,
  IEncuestaSatisfaccionRepository,
} from '../csat/domain/ports/i-encuesta-satisfaccion.repository';

import { DASHBOARD_REPOSITORY, IDashboardRepository } from './domain/ports/i-dashboard.repository';
import { PrismaDashboardRepository } from './infrastructure/persistence/prisma/prisma-dashboard.repository';
import { ObtenerMetricasUseCase } from './application/use-cases/obtener-metricas.use-case';
import { DashboardController } from './interface/controllers/dashboard.controller';

/**
 * DashboardModule — módulo NestJS del dominio "dashboard" (Fase 4, PR-D).
 *
 * Agregaciones read-only por tenant + ciclo (D1), con scope por rol (D2):
 * TECNICO ve solo lo suyo, ADMINISTRADOR/COLABORADOR ven el tenant
 * completo. Endpoint gateado por `ticket:ver_todos` (D3, sin permiso
 * nuevo).
 *
 * Wiring:
 * - Repo: DASHBOARD_REPOSITORY (tenant, vía TenantContext).
 * - Use case: ObtenerMetricasUseCase (resuelve ciclo efectivo reusando
 *   CICLO_CLIENTE_REPOSITORY de TicketsModule — mismo criterio que
 *   `ListarTicketsUseCase`, T7 — y el scope self/global por `actor.rol`).
 *   WU9.1 (ADR-C5): también recibe ENCUESTA_SATISFACCION_REPOSITORY de
 *   `CsatLecturaModule` para el KPI `csatPromedio`/`csatRespuestas`,
 *   gateado POR CAMPO dentro del propio use case — no acá.
 * - odd/promedios-dashboard-habiles: los tiempos medios promedian segundos hábiles ya guardados
 *   por ticket, así que el repo ya no carga el calendario ni los feriados.
 * - odd/tareas-con-tecnico T4: la métrica de tareas completadas por técnico usa
 *   TAREA_TICKET_REPOSITORY y USUARIO_MASTER_CHECKER, los dos exportados por `TicketsModule`.
 * - odd/tasks/tiempo-tecnico.md T4: el cumplimiento por técnico usa
 *   CUMPLIMIENTO_TECNICO_REPOSITORY, exportado por `TiempoTecnicoModule`.
 * - Importa `TicketsModule` (para CICLO_CLIENTE_REPOSITORY), `CsatLecturaModule`
 *   (para ENCUESTA_SATISFACCION_REPOSITORY), `TiempoTecnicoModule` (para
 *   CUMPLIMIENTO_TECNICO_REPOSITORY) y `AuthModule` (guards del controller).
 *
 * FITNESS RULE: PrismaService y @prisma/client solo pueden importarse desde
 * infrastructure/ (ver backend/eslint.config.js).
 */
@Module({
  imports: [AuthModule, TicketsModule, CsatLecturaModule, TiempoTecnicoModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: DASHBOARD_REPOSITORY,
      useFactory: (tenantContext: TenantContext) => new PrismaDashboardRepository(tenantContext),
      inject: [TenantContext],
    },
    {
      provide: ObtenerMetricasUseCase,
      useFactory: (
        dashboardRepo: IDashboardRepository,
        cicloClienteRepo: ICicloClienteRepository,
        csatRepo: IEncuestaSatisfaccionRepository,
        tareaRepo: ITareaTicketRepository,
        usuarioMasterChecker: IUsuarioMasterChecker,
        cumplimientoRepo: ICumplimientoTecnicoRepository,
      ) =>
        new ObtenerMetricasUseCase(
          dashboardRepo,
          cicloClienteRepo,
          csatRepo,
          tareaRepo,
          usuarioMasterChecker,
          cumplimientoRepo,
        ),
      inject: [
        DASHBOARD_REPOSITORY,
        CICLO_CLIENTE_REPOSITORY,
        ENCUESTA_SATISFACCION_REPOSITORY,
        TAREA_TICKET_REPOSITORY,
        USUARIO_MASTER_CHECKER,
        CUMPLIMIENTO_TECNICO_REPOSITORY,
      ],
    },
  ],
  exports: [DASHBOARD_REPOSITORY],
})
export class DashboardModule {}
