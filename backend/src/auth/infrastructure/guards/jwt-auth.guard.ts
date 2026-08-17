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
 * 3. Si válido y con la versión de payload esperada: setea `request.user =
 *    payload`, retorna true.
 * 4. Si ausente/inválido/versión desactualizada: lanza `UnauthorizedException`
 *    (401 — NUNCA 403, ver ADR-P7 abajo).
 *
 * Los guards subsiguientes (TenantGuard, AccionesGuard, GlobalAdminGuard,
 * AdminClienteGuard) dependen de `request.user` estar seteado por este guard.
 *
 * IMPORTANTE: este guard NUNCA consulta la DB (R11) — toda la info necesaria
 * ya está en el JWT.
 *
 * ADR-P7 (WU-7.1, sdd/matriz-permisos-por-usuario): el chequeo de versión
 * (`payload.v !== VERSION_PAYLOAD_JWT`) va ACÁ, no dentro de
 * `ITokenService.verifyJwt` — `verifyJwt` es infraestructura de firma
 * (criptografía), la versión del payload es política de autenticación. El
 * rechazo es 401 (`UnauthorizedException`), a propósito NO 403: el
 * interceptor del frontend (`client.ts:76`) solo dispara el flujo de
 * refresh single-flight ante un 401 — un 403 pasa de largo sin recuperación
 * hasta que el usuario recargue a mano o el token expire por TTL
 * (riesgo #2218). Va DESPUÉS de `verifyJwt` y ANTES de setear `request.user`,
 * para que ningún guard subsiguiente vea un payload con forma vieja.
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
import {
  ITokenService,
  JwtPayload,
  TOKEN_SERVICE,
  VERSION_PAYLOAD_JWT,
} from '../../domain/ports/i-token.service';

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

    // ADR-P7: tokens emitidos antes de este campo no lo traen (`v ===
    // undefined` en runtime pese al tipo `number`) — el `!==` los ataja
    // igual que a un `v` desactualizado. 401, nunca 403 (ver docstring).
    if (payload.v !== VERSION_PAYLOAD_JWT) {
      throw new UnauthorizedException('Sesión desactualizada');
    }

    request.user = payload;
    return true;
  }
}
