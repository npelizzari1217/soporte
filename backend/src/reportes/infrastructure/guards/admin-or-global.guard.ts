/**
 * AdminOrGlobalGuard — permite acceso cuando el usuario es is_global_admin
 * O tiene el rol ADMINISTRADOR en su JWT.
 *
 * Diseño (ADR-4, admin-general):
 * - Lee request.user del payload ya decodificado por JwtAuthGuard.
 * - Condición OR: is_global_admin === true ó roles.includes('ADMINISTRADOR').
 * - NUNCA consulta DB — evaluación O(1) pura sobre el JWT.
 * - Composable: se aplica DESPUÉS de JwtAuthGuard en la cadena de guards.
 *   @UseGuards(JwtAuthGuard, TenantGuard, AdminOrGlobalGuard)
 *
 * Invariante del spec: ADMINISTRADOR por tenant y is_global_admin son orthogonales.
 * Este guard permite CUALQUIERA de los dos — sin permiso granular adicional.
 *
 * Tarea: T4.2 (PR4, admin-general)
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

@Injectable()
export class AdminOrGlobalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();

    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere autenticación con rol ADMINISTRADOR o is_global_admin',
      );
    }

    const isGlobalAdmin = user.is_global_admin === true;
    const isAdministrador = Array.isArray(user.roles) && user.roles.includes('ADMINISTRADOR');

    if (!isGlobalAdmin && !isAdministrador) {
      throw new ForbiddenException(
        'Acceso denegado: se requiere rol ADMINISTRADOR o is_global_admin',
      );
    }

    return true;
  }
}
