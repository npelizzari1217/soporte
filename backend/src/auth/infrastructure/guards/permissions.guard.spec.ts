/**
 * permissions.guard.spec.ts — TDD RED phase (T6.3, PR6).
 *
 * PermissionsGuard: exige (AND) que TODOS los permisos declarados vía
 * `@RequirePermissions(...)` estén en `payload.permisos`. Sin metadata →
 * pass-through. `request.user` null → 403. NUNCA consulta DB (R13).
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

function buildContext(user: JwtPayload | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const BASE_PAYLOAD: JwtPayload = {
  sub: 'usuario-1',
  cliente_id: 'cliente-1',
  rol: 'TECNICO',
  permisos: ['ticket:crear', 'ticket:editar'],
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
};

describe('PermissionsGuard (R13)', () => {
  function buildGuard(requiredPermissions: string[] | null): PermissionsGuard {
    const reflector = {
      getAllAndOverride: () => requiredPermissions,
    } as unknown as Reflector;
    return new PermissionsGuard(reflector);
  }

  it('sin metadata de permisos → pass-through (true)', () => {
    const guard = buildGuard(null);
    const context = buildContext(BASE_PAYLOAD);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('metadata vacía ([]) → pass-through (true)', () => {
    const guard = buildGuard([]);
    const context = buildContext(BASE_PAYLOAD);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('request.user null con metadata presente → ForbiddenException', () => {
    const guard = buildGuard(['ticket:crear']);
    const context = buildContext(null);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('usuario SIN todos los permisos requeridos (AND) → ForbiddenException', () => {
    const guard = buildGuard(['ticket:crear', 'ticket:eliminar']);
    const context = buildContext(BASE_PAYLOAD);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('usuario con TODOS los permisos requeridos → true', () => {
    const guard = buildGuard(['ticket:crear', 'ticket:editar']);
    const context = buildContext(BASE_PAYLOAD);

    expect(guard.canActivate(context)).toBe(true);
  });
});
