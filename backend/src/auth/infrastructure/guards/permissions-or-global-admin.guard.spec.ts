/**
 * T3.2 [RED] — Unit tests para PermissionsOrGlobalAdminGuard.
 *
 * Guard combinado: permite si el usuario tiene TODOS los permisos requeridos
 * (@RequirePermissions, mismo metadata que PermissionsGuard) O si es operador
 * global (is_global_admin === true), sin importar sus permisos.
 *
 * Por qué NO reusar AdminOrGlobalGuard: ese chequea roles.includes('ADMINISTRADOR')
 * (nombre de rol), no el permiso real del JWT — frágil ante evolución de RBAC.
 *
 * Spec ref: ciclos-master-tenant/design ADR-7 (riesgo #1), T3.2
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsOrGlobalAdminGuard } from './permissions-or-global-admin.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000001',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'test@test.com',
    roles: ['USUARIO'],
    permisos: [],
    cliente_nombre: 'Test Corp',
    is_global_admin: false,
    ...overrides,
  };
}

function makeContext(user: JwtPayload | null): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('PermissionsOrGlobalAdminGuard', () => {
  let reflector: Reflector;
  let guard: PermissionsOrGlobalAdminGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsOrGlobalAdminGuard(reflector);
  });

  it('bypass: is_global_admin=true, permisos=[], metadata requiere ciclo:gestionar → true', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ciclo:gestionar']);
    const ctx = makeContext(makePayload({ is_global_admin: true, permisos: [] }));

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permiso real: is_global_admin=false, permisos incluye ciclo:gestionar → true (ADMINISTRADOR del cliente)', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ciclo:gestionar']);
    const ctx = makeContext(makePayload({ is_global_admin: false, permisos: ['ciclo:gestionar'] }));

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza: is_global_admin=false, permisos=[] (rol regular) → ForbiddenException', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ciclo:gestionar']);
    const ctx = makeContext(makePayload({ is_global_admin: false, permisos: [] }));

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('rechaza: tiene OTRO permiso pero no el requerido → ForbiddenException', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ciclo:gestionar']);
    const ctx = makeContext(makePayload({ is_global_admin: false, permisos: ['ticket:crear'] }));

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('pass-through: sin metadata PERMISSIONS_KEY (endpoint sin @RequirePermissions) → true', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    const ctx = makeContext(makePayload());

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('request.user es null → ForbiddenException', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ciclo:gestionar']);
    const ctx = makeContext(null);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ambos caminos válidos a la vez: is_global_admin=true Y permisos incluye el requerido → true', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ciclo:gestionar']);
    const ctx = makeContext(makePayload({ is_global_admin: true, permisos: ['ciclo:gestionar'] }));

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
