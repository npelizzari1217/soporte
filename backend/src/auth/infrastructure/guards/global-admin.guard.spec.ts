/**
 * global-admin.guard.spec.ts — TDD RED phase (T6.4, PR6).
 *
 * GlobalAdminGuard: permite únicamente si `payload.is_global_admin === true`.
 * NUNCA se deriva del rol ADMINISTRADOR de una membresía (ortogonalidad, R14).
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GlobalAdminGuard } from './global-admin.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';
import { payloadDeTest } from '../../test-helpers/payload-de-test';

function buildContext(user: JwtPayload | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return payloadDeTest({
    sub: 'usuario-1',
    cliente_id: null,
    rol: null,
    permisos: [],
    cliente_nombre: null,
    ...overrides,
  });
}

describe('GlobalAdminGuard (R14)', () => {
  it('request.user null → ForbiddenException', () => {
    const guard = new GlobalAdminGuard();
    expect(() => guard.canActivate(buildContext(null))).toThrow(ForbiddenException);
  });

  it('is_global_admin=false → ForbiddenException (incl. rol ADMINISTRADOR — ortogonalidad)', () => {
    const guard = new GlobalAdminGuard();
    const user = buildPayload({ is_global_admin: false, rol: 'ADMINISTRADOR' });
    expect(() => guard.canActivate(buildContext(user))).toThrow(ForbiddenException);
  });

  it('is_global_admin=true → true', () => {
    const guard = new GlobalAdminGuard();
    const user = buildPayload({ is_global_admin: true });
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });
});
