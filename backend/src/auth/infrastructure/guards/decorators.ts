/**
 * Decoradores para guards de autenticación/autorización.
 *
 * @RequirePermissions('ticket:crear') — requiere que el JWT tenga TODOS los
 * permisos listados (AND). Ver `PermissionsGuard` (R13).
 * @CurrentUser() — inyecta el `JwtPayload` de `request.user` en el parámetro
 * del handler.
 *
 * Tarea: T6.3 (PR6 — Guards + AuthController + AuthModule)
 */
import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';

/** Clave de metadatos para PermissionsGuard. */
export const PERMISSIONS_KEY = 'permissions';

/** Clave de metadatos para ModulosGuard. */
export const REQUIRE_MODULO_KEY = 'require_modulo';

/**
 * @RequirePermissions(...permissions) — declara los permisos requeridos para
 * el endpoint. `PermissionsGuard` evalúa si el usuario tiene TODOS los
 * permisos (AND) — R13.
 *
 * @example
 * @RequirePermissions('ticket:crear', 'ticket:asignar')
 * @Post('tickets')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * @RequireModulo(modulo) — declara el módulo funcional requerido para operar
 * el endpoint (SOPORTE/COMPRAS/EDILICIA/EQUIPOS). `ModulosGuard` evalúa si el
 * usuario tiene el módulo asignado en su JWT (`payload.modulos`) — eje de
 * autorización ORTOGONAL al RBAC (feature 5.2 CAPA 2).
 *
 * Va a nivel de CLASE en los controllers de módulo: gatea TODOS los endpoints
 * (incl. lecturas) — si no tenés el módulo, no ves NADA de ese módulo. NO se
 * anula con un `@RequirePermissions()` vacío por método (son metadatas
 * distintas).
 *
 * @example
 * @RequireModulo('COMPRAS')
 * @Controller('compras')
 */
export const RequireModulo = (modulo: string) => SetMetadata(REQUIRE_MODULO_KEY, modulo);

/**
 * @CurrentUser() — inyecta el `JwtPayload` del usuario autenticado
 * (poblado por `JwtAuthGuard`).
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
