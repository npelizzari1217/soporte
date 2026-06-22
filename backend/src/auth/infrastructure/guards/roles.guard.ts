/**
 * RolesGuard — verifica que el usuario autenticado tenga al menos uno de los roles requeridos.
 *
 * Usa Reflector para leer los metadatos @Roles() del handler/controlador.
 * Si no hay metadata de roles, el endpoint es público y el guard pasa (pass-through).
 * La lógica es OR: basta con tener UN rol de la lista para acceder.
 *
 * IMPORTANTE: NUNCA consulta DB — evalúa payload.roles del JWT.
 *
 * Debe ir después de JwtAuthGuard en la cadena de guards.
 * Si request.user es null (JwtAuthGuard no corrió antes), lanza ForbiddenException.
 *
 * Tarea: 2.D.2
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | null>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin metadata de roles → endpoint público (o no requiere roles específicos).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Acceso denegado: usuario no autenticado');
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException(
        `Acceso denegado: se requiere uno de los roles [${requiredRoles.join(', ')}]`,
      );
    }

    return true;
  }
}
