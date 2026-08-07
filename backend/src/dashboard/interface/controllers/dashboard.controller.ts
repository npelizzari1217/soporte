/**
 * DashboardController — entry point HTTP de las agregaciones read-only del
 * dashboard (D1).
 *
 * Ruta:
 *   GET /dashboard/metricas → ObtenerMetricasUseCase
 *
 * Gateo (D3): TODA la ruta exige `ticket:ver_todos` — lo comparten
 * COLABORADOR/TECNICO/ADMINISTRADOR, USUARIO queda excluido (403). El scope
 * self (TECNICO, D2) vs. global (ADMINISTRADOR/COLABORADOR) se resuelve
 * DENTRO del use case a partir de `actorRol` — el controller solo traduce
 * HTTP ↔ use case, sin lógica de negocio.
 *
 * Ref spec: sdd/premium/spec D1, D2, D3. Tarea: D5/D6.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ObtenerMetricasUseCase } from '../../application/use-cases/obtener-metricas.use-case';
import {
  MetricasResponseDto,
  ObtenerMetricasQueryDto,
  toMetricasResponseDto,
} from '../dtos/metricas.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { CurrentUser, RequirePermissions } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

const PERMISO_VER_TODOS = 'ticket:ver_todos';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@RequirePermissions(PERMISO_VER_TODOS)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly obtenerMetricasUseCase: ObtenerMetricasUseCase) {}

  /**
   * GET /dashboard/metricas
   * Snapshot de KPIs del tenant filtrable por ciclo (D1). TECNICO ve solo
   * su propio scope (D2, resuelto en el use case a partir de `user.rol`).
   * @throws 403 sin `ticket:ver_todos` (USUARIO)
   */
  @Get('metricas')
  async obtenerMetricas(
    @CurrentUser() user: JwtPayload,
    @Query() query: ObtenerMetricasQueryDto,
  ): Promise<MetricasResponseDto> {
    const metricas = await this.obtenerMetricasUseCase.execute({
      actorId: user.sub,
      actorRol: user.rol,
      cicloId: query.ciclo,
    });
    return toMetricasResponseDto(metricas);
  }
}
