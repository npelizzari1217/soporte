/**
 * JwtAuthGuard — verifica el JWT en el header Authorization Bearer.
 *
 * Diseño: NO usa passport-jwt estrategia heredada. Llama directamente al
 * ITokenService para verificar el token — más simple y testeable en unidad.
 *
 * Flujo:
 * 1. Extrae el token del header Authorization: Bearer <token>.
 * 2. Llama ITokenService.verifyJwt(token).
 * 3. Si válido: setea request.user = payload, retorna true.
 * 4. Si inválido/ausente: lanza UnauthorizedException.
 *
 * Los guards subsiguientes (RolesGuard, PermissionsGuard, TenantGuard)
 * dependen de request.user siendo seteado por este guard.
 *
 * IMPORTANTE: los guards NO consultan DB. Toda la info necesaria está en el JWT.
 *
 * Tarea: 2.D.2
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

    const token = authHeader.slice(7); // Remove 'Bearer '
    const payload = this.tokenService.verifyJwt(token);

    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    request.user = payload;
    return true;
  }
}
