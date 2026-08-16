/**
 * admin-cliente.guard.spec.ts — WU-6 (sdd/matriz-permisos-por-usuario).
 *
 * AdminClienteGuard: permite ROOT o ADMINISTRADOR de la membresía activa.
 * Gemelo de GlobalAdminGuard con una condición más laxa. Sin metadata —
 * aplicado por MÉTODO (nunca a nivel de clase, ADR-P5), todavía sin uso en
 * ningún controller (eso es WU-7.3).
 */
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminClienteGuard } from './admin-cliente.guard';
import { JwtPayload } from '../../domain/ports/i-token.service';

function buildContext(user: JwtPayload | null): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function buildPayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'usuario-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: [],
    is_global_admin: false,
    cliente_nombre: 'Cliente 1',
    membresias: [],
    modulos: [],
    nombre: 'Test',
    apellido: 'Usuario',
    ...overrides,
  };
}

describe('AdminClienteGuard (R4)', () => {
  it('request.user null → ForbiddenException', () => {
    const guard = new AdminClienteGuard();
    expect(() => guard.canActivate(buildContext(null))).toThrow(ForbiddenException);
  });

  it('ROOT (is_global_admin=true) → true', () => {
    const guard = new AdminClienteGuard();
    const user = buildPayload({ is_global_admin: true, rol: null });
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('ADMINISTRADOR de la membresía activa → true', () => {
    const guard = new AdminClienteGuard();
    const user = buildPayload({ rol: 'ADMINISTRADOR' });
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('TECNICO (no admin, no root) → 403 con mensaje exacto (S9)', () => {
    const guard = new AdminClienteGuard();
    const user = buildPayload({ rol: 'TECNICO' });
    expect(() => guard.canActivate(buildContext(user))).toThrow(
      'Acceso denegado: se requiere ADMINISTRADOR del cliente',
    );
  });
});
