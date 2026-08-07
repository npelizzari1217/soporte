/**
 * GlobalAdminGuard — permite únicamente usuarios con `is_global_admin = true`
 * en su JWT.
 *
 * Diseño (R14):
 * - Lee `request.user.is_global_admin` del payload ya decodificado por
 *   `JwtAuthGuard`.
 * - NUNCA consulta DB — evaluación O(1) pura sobre el JWT.
 * - Composable: se aplica DESPUÉS de `JwtAuthGuard`.
 *   `@UseGuards(JwtAuthGuard, GlobalAdminGuard)`
 *
 * Invariante: `is_global_admin = true` NO implica rol ADMINISTRADOR y
 * viceversa (ortogonalidad) — un ADMINISTRADOR con `is_global_admin = false`
 * NO pasa este guard.
 *
 * Tarea: T6.4 (PR6 — Guards + AuthController + AuthModule)
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
