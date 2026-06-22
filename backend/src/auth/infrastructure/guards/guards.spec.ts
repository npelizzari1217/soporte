/**
 * 2.D.1 TEST — Unit tests para guards de autenticación/autorización.
 *
 * Guards testeados:
 * - JwtAuthGuard: verifica JWT en header Authorization Bearer, rechaza sin token.
 * - RolesGuard: verifica que el JWT tenga los roles requeridos (array OR).
 * - PermissionsGuard: verifica que el JWT tenga los permisos requeridos.
 * - TenantGuard: verifica que el JWT tenga un cliente_id válido.
 *
 * Invariantes de diseño que los tests codifican:
 * - Los guards NUNCA consultan DB — solo evalúan el payload del JWT.
 * - Si no hay metadata de roles/permisos (endpoint público), el guard pasa.
 * - TenantGuard falla si cliente_id es null o vacío en el JWT.
 * - Si el usuario no está en el request (sin JwtAuthGuard previo), retorna 403.
 *
 * Tarea: 2.D.1
 */

import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { TenantGuard } from './tenant.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000001',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'test@test.com',
    roles: ['ADMIN'],
    permisos: ['ticket:crear', 'compra:aprobar', 'usuario:gestionar'],
    ...overrides,
  };
}

function makeContext(
  payload: JwtPayload | null,
  _meta?: { requiredRoles?: string[]; requiredPermissions?: string[] },
): ExecutionContext {
  const request = {
    user: payload,
    headers: {},
  } as any;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// ─── JwtAuthGuard ─────────────────────────────────────────────────────────────

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockITokenService: { verifyJwt: jest.Mock };

  beforeEach(() => {
    mockITokenService = { verifyJwt: jest.fn() };
    guard = new JwtAuthGuard(mockITokenService as any);
  });

  it('permite request cuando el token es válido', () => {
    const payload = makePayload();
    mockITokenService.verifyJwt.mockReturnValue(payload);

    const request: any = { headers: { authorization: 'Bearer valid-token' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(request.user).toEqual(payload);
  });

  it('lanza UnauthorizedException cuando no hay header Authorization', () => {
    const request: any = { headers: {}, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el token es inválido/expirado', () => {
    mockITokenService.verifyJwt.mockReturnValue(null);

    const request: any = { headers: { authorization: 'Bearer expired-token' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('lanza UnauthorizedException cuando el header no es Bearer', () => {
    const request: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' }, user: null };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

// ─── RolesGuard ───────────────────────────────────────────────────────────────

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('permite cuando no hay metadata de roles (endpoint público)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const ctx = makeContext(makePayload());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando el usuario tiene uno de los roles requeridos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'SOPORTE_IT']);
    const ctx = makeContext(makePayload({ roles: ['ADMIN'] }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando el usuario no tiene ningún rol requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = makeContext(makePayload({ roles: ['SOLICITANTE'] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay usuario en el request (sin JwtAuthGuard previo)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ─── PermissionsGuard ─────────────────────────────────────────────────────────

describe('PermissionsGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  it('permite cuando no hay metadata de permisos (endpoint público)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const ctx = makeContext(makePayload());
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando el usuario tiene todos los permisos requeridos', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ticket:crear', 'compra:aprobar']);
    const ctx = makeContext(
      makePayload({ permisos: ['ticket:crear', 'compra:aprobar', 'usuario:gestionar'] }),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando falta al menos un permiso requerido', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ticket:crear', 'rol:asignar']);
    const ctx = makeContext(makePayload({ permisos: ['ticket:crear'] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay usuario en el request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ticket:crear']);
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

// ─── TenantGuard ──────────────────────────────────────────────────────────────

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  it('permite cuando el JWT tiene un cliente_id válido', () => {
    const ctx = makeContext(makePayload({ cliente_id: 'c1111111-0000-4000-8000-000000000001' }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando cliente_id está vacío', () => {
    const ctx = makeContext(makePayload({ cliente_id: '' }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay usuario en el request', () => {
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
