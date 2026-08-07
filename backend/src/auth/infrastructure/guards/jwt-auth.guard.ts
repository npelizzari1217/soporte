/**
 * JwtAuthGuard — verifica el JWT en el header `Authorization: Bearer <token>`.
 *
 * Diseño (R11, mismo patrón probado de soporte1): NO usa `passport-jwt`.
 * Llama directamente a `ITokenService.verifyJwt` — más simple y testeable en
 * unidad que una estrategia Passport, y evita una dependencia adicional para
 * un guard de ~15 líneas.
 *
 * Flujo:
 * 1. Extrae el token del header `Authorization: Bearer <token>`.
 * 2. Llama `ITokenService.verifyJwt(token)`.
 * 3. Si válido: setea `request.user = payload`, retorna true.
 * 4. Si ausente/inválido: lanza `UnauthorizedException` (401).
 *
 * Los guards subsiguientes (TenantGuard, PermissionsGuard, GlobalAdminGuard)
 * dependen de `request.user` estar seteado por este guard.
 *
 * IMPORTANTE: este guard NUNCA consulta la DB (R11) — toda la info necesaria
 * ya está en el JWT.
 *
 * Tarea: T6.1 (PR6 — Guards + AuthController + AuthModule)
 */
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ITokenService, JwtPayload, TOKEN_SERVICE } from '../../domain/ports/i-token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user: JwtPayload | null }>();

    const authHeader = request.headers['authorization'] ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de acceso requerido');
    }

    const token = authHeader.slice(7);
    const payload = this.tokenService.verifyJwt(token);

    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    request.user = payload;
    return true;
  }
}
