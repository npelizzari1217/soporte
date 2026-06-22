/**
 * TenantGuard — verifica que el JWT contenga un cliente_id válido.
 *
 * Protege endpoints que requieren un tenant válido (la mayoría de los endpoints
 * de negocio). Falla si cliente_id está ausente o vacío.
 *
 * IMPORTANTE: NO valida que el cliente exista en DB. Solo verifica que el claim
 * está presente en el JWT (fue seteado al momento del login).
 *
 * Debe ir después de JwtAuthGuard en la cadena de guards.
 *
 * Tarea: 2.D.2
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { JwtPayload } from '../../domain/ports/i-token.service';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload | null }>();
    const user = request.user;

    if (!user || !user.cliente_id) {
      throw new ForbiddenException('Acceso denegado: tenant no identificado');
    }

    return true;
  }
}
