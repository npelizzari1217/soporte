/**
 * DashboardController — entry point HTTP de las agregaciones read-only del
 * dashboard (D1).
 *
 * Ruta:
 *   GET /dashboard/metricas → ObtenerMetricasUseCase
 *
 * Gateo (D3): TODA la ruta exige `DASHBOARD:LECTURA` (WU-7.3, renombrado
 * desde `ticket:ver_todos`) — lo comparten COLABORADOR/TECNICO/ADMINISTRADOR,
 * USUARIO queda excluido (403). El scope self (TECNICO, D2) vs. global
 * (ADMINISTRADOR/COLABORADOR) se resuelve DENTRO del use case a partir de
 * `actorRol` — el controller solo traduce HTTP ↔ use case, sin lógica de
 * negocio.
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
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser, RequiereAcciones } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { puedeEjecutar } from '../../../auth/domain/permisos.util';

/** WU9.1 (ADR-C5): gateo del KPI de satisfacción POR CAMPO, no por decorador. */
const ACCION_CSAT_LECTURA = 'CSAT:LECTURA';

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@RequiereAcciones('DASHBOARD:LECTURA')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly obtenerMetricasUseCase: ObtenerMetricasUseCase) {}

  /**
   * GET /dashboard/metricas
   * Snapshot de KPIs del tenant filtrable por ciclo (D1). TECNICO ve solo
   * su propio scope (D2, resuelto en el use case a partir de `user.rol`).
   * `csatPromedio`/`csatRespuestas` viajan SOLO si el actor tiene
   * `CSAT:LECTURA` (WU9.1, ADR-C5) — gateo dentro del payload, la ruta
   * sigue exigiendo únicamente `DASHBOARD:LECTURA`.
   * @throws 403 sin `DASHBOARD:LECTURA` (USUARIO)
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
      tieneCsatLectura: puedeEjecutar(user, ACCION_CSAT_LECTURA),
    });
    return toMetricasResponseDto(metricas);
  }
}
