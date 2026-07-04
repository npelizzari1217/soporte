/**
 * ReparacionesController — endpoint REST para listar tickets edilicios.
 *
 * Rutas:
 *   GET /reparaciones → ListarReparacionesUseCase (autenticado)
 *
 * Path dedicado `reparaciones` para que el frontend pueda llamar
 * `apiFetch('reparaciones')` sin ambigüedad con el path `tickets-edilicio`
 * (que sirve para la creación de tickets edilicios).
 *
 * Guard chain (clase): JwtAuthGuard → RolesGuard → PermissionsGuard → TenantGuard
 * GET no requiere permiso adicional — solo autenticación.
 *
 * Filtro por ciclo (Fase 4, ciclos-master-tenant, ADR-5): `?cicloId=` opcional.
 * Sin especificar, filtra por el ciclo ACTIVO del tenant.
 *
 * Tarea: feat/tickets-list-mvp; 4.4 (Fase 4, PR4)
 */
import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';

import { ListarReparacionesUseCase } from '../../application/use-cases/listar-reparaciones.use-case';
import {
  ListarReparacionesQueryDto,
  ReparacionListItemResponseDto,
} from '../dtos/reparaciones.dto';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('reparaciones')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ReparacionesController {
  constructor(private readonly listarReparacionesUseCase: ListarReparacionesUseCase) {}

  /**
   * GET /reparaciones
   * Retorna los tickets edilicios del ciclo filtrado (default: ciclo ACTIVO del
   * tenant; `?cicloId=` explícito permite consultar histórico). Excluye tickets
   * soft-deleted. Solo requiere autenticación (sin permiso extra).
   *
   * Para cada ticket edilicio incluye: ticket base (numero, titulo, estadoId)
   * + ubicacionNombre (null si la ubicacion fue eliminada) + porcentajeAvance.
   *
   * @returns 200 OK + ReparacionListItemResponseDto[]
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listarReparaciones(
    @Query() query: ListarReparacionesQueryDto,
  ): Promise<ReparacionListItemResponseDto[]> {
    const result = await this.listarReparacionesUseCase.execute(query?.cicloId);
    return result.getValue();
  }
}
