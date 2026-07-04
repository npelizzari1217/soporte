/**
 * PermissionsOrGlobalAdminGuard — permite acceso si el usuario tiene TODOS los
 * permisos requeridos (@RequirePermissions, mismo metadata que PermissionsGuard)
 * O si es operador global (is_global_admin === true).
 *
 * Por qué NO reusar AdminOrGlobalGuard (reportes/infrastructure/guards):
 * ese guard chequea `roles.includes('ADMINISTRADOR')` (nombre de rol), no el
 * permiso real del JWT. Acoplar a nombre de rol es frágil si RBAC evoluciona
 * (ej. otro rol gana el permiso). Este guard generaliza el patrón de
 * PermissionsGuard (permisos reales del JWT) y agrega el bypass de operador
 * global — misma convención de permisos, no la de roles.
 *
 * NUNCA consulta DB — evalúa payload.permisos / is_global_admin del JWT.
 * Debe ir después de JwtAuthGuard en la cadena de guards.
 *
 * Tarea: T3.2 (ciclos-master-tenant, Fase 3)
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class PermissionsOrGlobalAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | null>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin metadata de permisos → endpoint público.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso denegado: usuario no autenticado');
    }

    // Bypass: operador global opera en nombre del tenant vía X-Tenant-Id.
    if (user.is_global_admin === true) {
      return true;
    }

    // AND: todos los permisos requeridos deben estar en el JWT (ADMINISTRADOR del cliente).
    const missingPermissions = requiredPermissions.filter((p) => !user.permisos.includes(p));
    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Acceso denegado: permisos faltantes [${missingPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
