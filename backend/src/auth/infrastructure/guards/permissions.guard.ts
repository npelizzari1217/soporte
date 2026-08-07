/**
 * PermissionsGuard — verifica que el usuario autenticado tenga TODOS los
 * permisos requeridos.
 *
 * Usa `Reflector` para leer los metadatos `@RequirePermissions()` del
 * handler/controller. Sin metadata → endpoint público (pass-through). La
 * lógica es AND: el usuario debe tener TODOS los permisos de la lista (R13).
 *
 * IMPORTANTE: NUNCA consulta la DB — evalúa `payload.permisos` del JWT.
 * Debe correr DESPUÉS de `JwtAuthGuard`.
 *
 * ROOT (`is_global_admin=true`) bypassea el chequeo de permisos: no es un
 * rol, es un flag ortogonal, y por diseño puede TODO (mismo criterio que
 * `GlobalAdminGuard`). Esto cierra el hueco por el cual un ROOT con
 * `permisos=[]` recibía 403 en endpoints gateados por permiso.
 *
 * Tarea: T6.3 (PR6 — Guards + AuthController + AuthModule); fix ROOT bypass
 * (sdd/root-access-fix).
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | null>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso denegado: usuario no autenticado');
    }

    if (user.is_global_admin) {
      return true;
    }

    const missingPermissions = requiredPermissions.filter((p) => !user.permisos.includes(p));
    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Acceso denegado: permisos faltantes [${missingPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
