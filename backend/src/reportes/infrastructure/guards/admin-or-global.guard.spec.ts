/**
 * T4.2 [RED] — Unit tests para AdminOrGlobalGuard
 *
 * AdminOrGlobalGuard: permite acceso cuando:
 *   - is_global_admin === true, O
 *   - roles incluye 'ADMINISTRADOR'
 *
 * Aplica DESPUÉS de JwtAuthGuard (que hidrata request.user).
 * Sin queries a DB — evaluación O(1) pura sobre el payload del request.
 *
 * Spec ref: reportes/Niveles de acceso
 * Tarea: T4.2 (PR4, admin-general)
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminOrGlobalGuard } from './admin-or-global.guard';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000001',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'test@test.com',
    roles: [],
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

describe('AdminOrGlobalGuard', () => {
  let guard: AdminOrGlobalGuard;

  beforeEach(() => {
    guard = new AdminOrGlobalGuard();
  });

  it('permite cuando is_global_admin es true (sin importar roles)', () => {
    const ctx = makeContext(makePayload({ is_global_admin: true, roles: [] }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando rol ADMINISTRADOR está presente (is_global_admin false)', () => {
    const ctx = makeContext(makePayload({ is_global_admin: false, roles: ['ADMINISTRADOR'] }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('permite cuando is_global_admin true Y tiene rol ADMINISTRADOR', () => {
    const ctx = makeContext(
      makePayload({ is_global_admin: true, roles: ['ADMINISTRADOR'] }),
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando rol es TECNICO (no admin, no global)', () => {
    const ctx = makeContext(makePayload({ is_global_admin: false, roles: ['TECNICO'] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando roles está vacío y no es global admin', () => {
    const ctx = makeContext(makePayload({ is_global_admin: false, roles: [] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando rol es USUARIO', () => {
    const ctx = makeContext(makePayload({ is_global_admin: false, roles: ['USUARIO'] }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando no hay request.user (sin JwtAuthGuard previo)', () => {
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('evalúa en O(1) sin repositorios inyectados — constructor sin parámetros', () => {
    const g = new AdminOrGlobalGuard();
    expect(g).toBeInstanceOf(AdminOrGlobalGuard);

    const ctx = makeContext(makePayload({ is_global_admin: true }));
    expect(g.canActivate(ctx)).toBe(true);
  });
});
