/**
 * ModulosGuard — verifica que el usuario autenticado tenga asignado el módulo
 * funcional requerido (SOPORTE/COMPRAS/EDILICIA/EQUIPOS).
 *
 * Usa `Reflector` para leer el metadato `@RequireModulo()` del
 * handler/controller. Sin metadata → endpoint sin gate de módulo
 * (pass-through). El eje "módulos" es ORTOGONAL al RBAC: un usuario puede
 * tener el permiso `ticket:crear` pero no ver el módulo COMPRAS, y viceversa
 * (feature 5.2 CAPA 2).
 *
 * IMPORTANTE: NUNCA consulta la DB — evalúa `payload.modulos` del JWT
 * (poblado en login/switch/refresh, CAPA 1). Debe correr DESPUÉS de
 * `JwtAuthGuard`.
 *
 * ROOT (`is_global_admin=true`) bypassea el chequeo: es un flag ortogonal que
 * por diseño puede TODO (mismo criterio que `PermissionsGuard`). ADMINISTRADOR
 * ya recibe TODOS los módulos en el JWT (CAPA 1), por lo que pasa el
 * `includes` sin necesidad de un bypass explícito.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_MODULO_KEY } from './decorators';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class ModulosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const moduloRequerido = this.reflector.getAllAndOverride<string | null>(REQUIRE_MODULO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!moduloRequerido) {
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

    if (user.modulos?.includes(moduloRequerido)) {
      return true;
    }

    throw new ForbiddenException(`Acceso denegado: se requiere el módulo "${moduloRequerido}"`);
  }
}
