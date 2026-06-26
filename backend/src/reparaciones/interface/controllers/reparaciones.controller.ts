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
 * Tarea: feat/tickets-list-mvp
 */
import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/infrastructure/guards/roles.guard';
import { PermissionsGuard } from '../../../auth/infrastructure/guards/permissions.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';

import { ListarReparacionesUseCase } from '../../application/use-cases/listar-reparaciones.use-case';
import { ReparacionListItemResponseDto } from '../dtos/reparaciones.dto';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('reparaciones')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, TenantGuard)
export class ReparacionesController {
  constructor(private readonly listarReparacionesUseCase: ListarReparacionesUseCase) {}

  /**
   * GET /reparaciones
   * Retorna todos los tickets edilicios del tenant activo, ordenados por createdAt desc.
   * Excluye tickets soft-deleted. Solo requiere autenticación (sin permiso extra).
   *
   * Para cada ticket edilicio incluye: ticket base (numero, titulo, estadoId)
   * + ubicacionNombre (null si la ubicacion fue eliminada) + porcentajeAvance.
   *
   * @returns 200 OK + ReparacionListItemResponseDto[]
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listarReparaciones(): Promise<ReparacionListItemResponseDto[]> {
    const result = await this.listarReparacionesUseCase.execute();
    return result.getValue();
  }
}
