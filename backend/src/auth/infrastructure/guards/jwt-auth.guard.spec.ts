/**
 * jwt-auth.guard.spec.ts — TDD RED phase (T6.1, PR6). Ampliado en WU-7.1
 * (sdd/matriz-permisos-por-usuario, ADR-P7) con el chequeo de versión del
 * payload.
 *
 * JwtAuthGuard: extrae el Bearer token del header Authorization, lo verifica
 * vía ITokenService (SIN passport-jwt — mismo patrón probado de soporte1,
 * más simple y testeable en unidad que una estrategia Passport), rechaza
 * payloads con `v` desactualizada, y setea `request.user`. Sin acceso a DB
 * (R11).
 *
 * S3 (ADR-P7): el rechazo por versión es **401, NO 403** — el interceptor
 * del frontend (`client.ts:76`) solo dispara el flujo de refresh ante un
 * 401 (#2218). Un 403 pasa de largo sin recuperación.
 */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ITokenService, JwtPayload, VERSION_PAYLOAD_JWT } from '../../domain/ports/i-token.service';
import { payloadDeTest } from '../../test-helpers/payload-de-test';

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

const PAYLOAD: JwtPayload = payloadDeTest({
  sub: 'usuario-1',
  cliente_id: null,
  rol: null,
  permisos: [],
  is_global_admin: true,
  cliente_nombre: null,
  nombre: 'Root',
  apellido: 'Admin',
});

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

  // ─── S3 / ADR-P7: versión del payload (WU-7.1) ──────────────────────────
  describe('versión del payload (v)', () => {
    it('payload SIN v (undefined, token pre-rollout) → UnauthorizedException (401, NO 403)', () => {
      const payloadSinV = { ...PAYLOAD } as Partial<JwtPayload>;
      delete payloadSinV.v;
      const verifyJwt = vi.fn(() => payloadSinV as JwtPayload);
      const tokenService = buildTokenService({ verifyJwt });
      const guard = new JwtAuthGuard(tokenService);
      const { context } = buildContext({ authorization: 'Bearer token-sin-v' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('payload con v:1 (versión vieja) → UnauthorizedException (401, NO 403)', () => {
      const verifyJwt = vi.fn(() => ({ ...PAYLOAD, v: 1 }) as JwtPayload);
      const tokenService = buildTokenService({ verifyJwt });
      const guard = new JwtAuthGuard(tokenService);
      const { context } = buildContext({ authorization: 'Bearer token-v1' });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it(`payload con v:${VERSION_PAYLOAD_JWT} (versión correcta) → pasa, setea request.user`, () => {
      const verifyJwt = vi.fn(() => ({ ...PAYLOAD, v: VERSION_PAYLOAD_JWT }) as JwtPayload);
      const tokenService = buildTokenService({ verifyJwt });
      const guard = new JwtAuthGuard(tokenService);
      const { context, request } = buildContext({ authorization: 'Bearer token-v2' });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(request.user).toEqual({ ...PAYLOAD, v: VERSION_PAYLOAD_JWT });
    });
  });
});
