/**
 * TransicionEstadoPermisosGuard — guard body-aware para PATCH /tickets/:id/estado.
 *
 * Lee `request.body.nuevoEstadoCodigo` y mapea el arco solicitado al permiso
 * granular correspondiente, evaluando si el usuario autenticado lo posee en su JWT.
 *
 * Mapeo (ADR-4):
 *   APROBADO     → ticket:aprobar
 *   RECHAZADO    → ticket:rechazar
 *   cualquier otro (EN_PROGRESO, RESUELTO, SUSPENDIDO, SIN_SOLUCION) → ticket:transicionar
 *
 * Motivación: @RequirePermissions() solo acepta permisos ESTÁTICOS (metadatos decorador).
 * Este guard corre DESPUÉS del guard chain de clase (JwtAuthGuard → RolesGuard →
 * PermissionsGuard → TenantGuard) y aprovecha que request.user ya fue hidratado por JwtAuthGuard.
 *
 * Cierra bug activo en línea 343: PATCH /tickets/:id/estado carecía de guard de permisos
 * (violaba CONSTITUCIÓN §7 — menor privilegio).
 *
 * Retorna false (deniega) si:
 *   - body es null/undefined (sin nuevoEstadoCodigo)
 *   - request.user es null (JwtAuthGuard no corrió)
 *   - el usuario no tiene el permiso requerido
 *
 * Ref design: ADR-4
 * Ref spec: Req Autorización granular por arco (tickets-core/spec.md), auth-rbac/spec.md
 * Change: tickets-maquina-estados-observaciones / PR3
 * Task: P3.T9
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class TransicionEstadoPermisosGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user: JwtPayload | null;
      body: Record<string, unknown> | null;
    }>();

    const user = request.user;
    const nuevoEstadoCodigo: string | undefined = request.body?.nuevoEstadoCodigo as
      | string
      | undefined;

    // Sin body o sin nuevoEstadoCodigo: no hay arco que evaluar → denegar.
    if (!nuevoEstadoCodigo) {
      return false;
    }

    // Mapear arco → permiso requerido (ADR-4).
    const permiso =
      nuevoEstadoCodigo === 'APROBADO'
        ? 'ticket:aprobar'
        : nuevoEstadoCodigo === 'RECHAZADO'
          ? 'ticket:rechazar'
          : 'ticket:transicionar';

    // Verificar que el usuario tiene el permiso en su JWT (sin consultar DB).
    return user?.permisos?.includes(permiso) ?? false;
  }
}
