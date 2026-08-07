/**
 * jwt-auth.guard.spec.ts — TDD RED phase (T6.1, PR6).
 *
 * JwtAuthGuard: extrae el Bearer token del header Authorization, lo verifica
 * vía ITokenService (SIN passport-jwt — mismo patrón probado de soporte1,
 * más simple y testeable en unidad que una estrategia Passport) y setea
 * `request.user`. Sin acceso a DB (R11).
 */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';

function buildContext(headers: Record<string, string>): {
  context: ExecutionContext;
  request: { headers: Record<string, string>; user: JwtPayload | null };
} {
  const request: { headers: Record<string, string>; user: JwtPayload | null } = {
    headers,
    user: null,
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const PAYLOAD: JwtPayload = {
  sub: 'usuario-1',
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
  membresias: [],
};

describe('JwtAuthGuard (R11)', () => {
  function buildTokenService(overrides: Partial<ITokenService> = {}): ITokenService {
    return {
      signJwt: () => 'unused',
      verifyJwt: () => PAYLOAD,
      ...overrides,
    };
  }

  it('sin header Authorization → UnauthorizedException', () => {
    const tokenService = buildTokenService();
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('header sin prefijo Bearer → UnauthorizedException', () => {
    const tokenService = buildTokenService();
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Token abc123' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('token inválido (verifyJwt retorna null) → UnauthorizedException, NO consulta DB', () => {
    const verifyJwt = vi.fn(() => null);
    const tokenService = buildTokenService({ verifyJwt });
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Bearer token-invalido' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(verifyJwt).toHaveBeenCalledWith('token-invalido');
  });

  it('token válido → setea request.user y retorna true', () => {
    const tokenService = buildTokenService();
    const guard = new JwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Bearer token-valido' });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual(PAYLOAD);
  });
});
