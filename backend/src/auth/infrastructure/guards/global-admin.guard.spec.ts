/**
 * T1.1 [RED] — Unit tests para GlobalAdminGuard
 *
 * GlobalAdminGuard: evalúa request.user.is_global_admin del JWT ya decodificado.
 * Se aplica DESPUÉS de JwtAuthGuard (que hidrata request.user).
 * Sin queries a DB — evaluación O(1) pura sobre el payload del request.
 *
 * Spec ref: auth-rbac/GlobalAdminGuard
 * Tarea: T1.1 (PR1, admin-general)
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GlobalAdminGuard } from './global-admin.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: '01966a6a-0000-7000-8000-000000000001',
    cliente_id: 'c1111111-0000-4000-8000-000000000001',
    email: 'test@test.com',
    roles: ['ADMINISTRADOR'],
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

describe('GlobalAdminGuard', () => {
  let guard: GlobalAdminGuard;

  beforeEach(() => {
    guard = new GlobalAdminGuard();
  });

  it('lanza ForbiddenException cuando is_global_admin es false', () => {
    const ctx = makeContext(makePayload({ is_global_admin: false }));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('lanza ForbiddenException cuando is_global_admin es undefined', () => {
    const payload = makePayload();
    // Simula token legado sin el claim
    (payload as Record<string, unknown>)['is_global_admin'] = undefined;
    const ctx = makeContext(payload);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('retorna true cuando is_global_admin es true', () => {
    const ctx = makeContext(makePayload({ is_global_admin: true }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('lanza ForbiddenException cuando no hay request.user (sin JwtAuthGuard previo)', () => {
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('evalúa en O(1) sin repositorios inyectados — constructor sin parámetros', () => {
    // El guard no requiere dependencias de DI → es instanciable sin argumentos
    // Esto verifica que no hace llamadas a DB
    const g = new GlobalAdminGuard();
    expect(g).toBeInstanceOf(GlobalAdminGuard);

    // Con is_global_admin true, retorna true inmediatamente (sin I/O)
    const ctx = makeContext(makePayload({ is_global_admin: true }));
    const result = g.canActivate(ctx);
    expect(result).toBe(true);
  });
});
