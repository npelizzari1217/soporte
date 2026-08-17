/**
 * RolesController — entry point HTTP del catálogo GLOBAL de roles RBAC
 * (sdd/beta-frontend item 3, hueco descubierto por el frontend: el
 * formulario de alta de usuario necesita los 4 roles del sistema para
 * poblar el selector — antes hardcodeado en `features/usuarios/types.ts`).
 *
 * Rutas:
 *   GET /roles → ListarRolesUseCase
 *
 * `master.roles` es un catálogo COMPARTIDO por todos los tenants (NO hay
 * roles por cliente) — mismo criterio de lectura abierta que
 * `CatalogosController` (tipos-ticket/prioridades/estados, G1): CUALQUIER
 * usuario autenticado del tenant puede listarlo, SIN `@RequirePermissions`
 * (alimenta un select, no es una vista de gestión).
 *
 * Guards: `JwtAuthGuard` + `TenantGuard` (requieren JWT válido + tenant
 * resuelto) — sin gate de acciones (WU-7.3: `AccionesGuard`/`AdminClienteGuard`
 * no se agregan, mismo criterio pass-through que tenía `PermissionsGuard`
 * sin metadata).
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ListarRolesUseCase } from '../../application/use-cases/listar-roles.use-case';
import { RoleResponseDto, toRoleResponseDto } from '../dtos/role.dto';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly listarRolesUseCase: ListarRolesUseCase) {}

  /**
   * GET /roles
   * Lista los 4 roles del catálogo global RBAC (ADMINISTRADOR, TECNICO,
   * COLABORADOR, USUARIO), sin permisos cargados.
   */
  @Get()
  async listar(): Promise<RoleResponseDto[]> {
    const roles = await this.listarRolesUseCase.execute();
    return roles.map(toRoleResponseDto);
  }
}
