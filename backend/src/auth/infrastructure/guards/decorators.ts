/**
 * Decoradores para guards de autenticación/autorización.
 *
 * @Roles('ADMIN', 'SOPORTE_IT') — requiere que el JWT tenga al menos uno de los roles.
 * @RequirePermissions('ticket:crear') — requiere que el JWT tenga TODOS los permisos.
 * @CurrentUser() — inyecta el JwtPayload del request.user en el parámetro del handler.
 *
 * Tarea: 2.D.2
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';

/** Clave de metadatos para RolesGuard. */
export const ROLES_KEY = 'roles';
/** Clave de metadatos para PermissionsGuard. */
export const PERMISSIONS_KEY = 'permissions';

/**
 * @Roles(...roles) — declara los roles requeridos para acceder al endpoint.
 * RolesGuard evalúa si el usuario tiene al menos uno de estos roles (OR).
 *
 * @example
 * @Roles('ADMIN', 'SOPORTE_IT')
 * @Get('tickets')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * @RequirePermissions(...permissions) — declara los permisos requeridos para el endpoint.
 * PermissionsGuard evalúa si el usuario tiene TODOS los permisos (AND).
 *
 * @example
 * @RequirePermissions('ticket:crear', 'ticket:asignar')
 * @Post('tickets')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * @CurrentUser() — inyecta el JwtPayload del usuario autenticado.
 *
 * @example
 * @Get('me')
 * getMe(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
