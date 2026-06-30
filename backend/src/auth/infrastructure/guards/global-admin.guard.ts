/**
 * GlobalAdminGuard — permite únicamente usuarios con is_global_admin = true en su JWT.
 *
 * Diseño (ADR-1, admin-general):
 * - Lee request.user.is_global_admin del payload ya decodificado por JwtAuthGuard.
 * - NUNCA consulta DB — evaluación O(1) pura sobre el JWT.
 * - Composable: se aplica DESPUÉS de JwtAuthGuard en la cadena de guards.
 *   @UseGuards(JwtAuthGuard, GlobalAdminGuard)
 *
 * Invariante del spec: is_global_admin = true NO implica rol ADMINISTRADOR y viceversa.
 * Un ADMINISTRADOR con is_global_admin = false NO pasa este guard.
 *
 * Tarea: T1.2 (PR1, admin-general)
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class GlobalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();

    const user = request.user;

    if (!user || !user.is_global_admin) {
      throw new ForbiddenException('Acceso denegado: se requiere is_global_admin');
    }

    return true;
  }
}
